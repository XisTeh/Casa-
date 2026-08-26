import type {
  PersistedPurchaseSession,
  PurchaseItem,
  PurchaseSession,
} from '../../domain/purchase';
import type { PurchaseRepository } from '../../domain/purchase-repository';
import type {
  PurchaseSyncEntityType,
  PurchaseSyncOutboxEntry,
  PurchaseSyncRepository,
} from '../../domain/purchase-sync';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import type { ShoppingSyncRuntime } from '../shopping/OfflineFirstShoppingRepository';
import type {
  RemotePurchaseEntity,
  RemotePurchaseStore,
} from '../supabase/SupabasePurchaseRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from './LocalPurchaseRepository';

const clone = <T>(value: T): T => structuredClone(value);
const makeUuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        return (character === 'x' ? random : (random & 3) | 8).toString(16);
      });
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const versionOf = (entity: PersistedPurchaseSession | PurchaseItem) =>
  entity.updatedAt ?? ('startedAt' in entity ? entity.startedAt : entity.purchasedAt);
const outboxId = (type: PurchaseSyncEntityType, houseId: string, id: string) =>
  `${type}:${houseId}:${id}`;
const defaultRuntime: ShoppingSyncRuntime = {
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
  now: () => new Date(),
  addOnlineListener(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
  addVisibleListener(listener) {
    if (typeof document === 'undefined') return () => undefined;
    const handler = () => document.visibilityState === 'visible' && listener();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  schedule: (listener, delay) => setTimeout(listener, delay),
  cancel: (timer) => clearTimeout(timer),
};

export class OfflineFirstPurchaseRepository implements PurchaseRepository, PurchaseSyncRepository {
  private readonly local: LocalPurchaseRepository;
  private readonly listeners = new Map<
    string,
    Set<{ changed: () => void; status?: (status: ShoppingSyncStatus) => void }>
  >();
  private readonly disconnectByHouse = new Map<string, () => void>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    readonly database: CasaeLocalDatabase,
    private readonly remote: RemotePurchaseStore,
    private readonly actorId: string,
    private readonly runtime: ShoppingSyncRuntime = defaultRuntime,
  ) {
    this.local = new LocalPurchaseRepository(database);
  }

  initialize() {
    return this.local.initialize();
  }
  getActiveSession(houseId: string) {
    return this.local.getActiveSession(houseId);
  }
  getSession(houseId: string, sessionId: string) {
    return this.local.getSession(houseId, sessionId);
  }
  listActiveSessions(houseId: string) {
    return this.local.listActiveSessions(houseId);
  }
  listCompletedSessions(houseId: string) {
    return this.local.listCompletedSessions(houseId);
  }

  async createSession(session: PersistedPurchaseSession) {
    const prepared = this.prepareSession(session);
    const saved = await this.local.createSession(prepared);
    await this.enqueue('purchase-session', prepared);
    this.changed(session.houseId);
    void this.syncNow(session.houseId);
    return saved;
  }

  async savePurchasedItem(houseId: string, item: PurchaseItem) {
    const prepared = this.prepareItem(item);
    const saved = await this.local.savePurchasedItem(houseId, prepared);
    await this.enqueue('purchase-item', prepared);
    this.changed(houseId);
    void this.syncNow(houseId);
    return saved;
  }

  async removePurchasedItem(houseId: string, sessionId: string, purchaseItemId: string) {
    const session = await this.local.getSession(houseId, sessionId);
    const item = session?.items.find((candidate) => candidate.id === purchaseItemId);
    if (!session || session.status !== 'active' || !item)
      throw new Error('Esta compra não está mais ativa.');
    const timestamp = this.nextTimestamp(versionOf(item));
    const tombstone = { ...item, updatedAt: timestamp, deletedAt: timestamp };
    await this.local.putPersistedItem(tombstone);
    await this.enqueue('purchase-item', tombstone);
    this.changed(houseId);
    void this.syncNow(houseId);
    return (await this.local.getSession(houseId, sessionId))!;
  }

  async completeSession(
    houseId: string,
    sessionId: string,
    completedAt: string,
    totalPriceCents: number,
    purchasedShoppingItemIds: string[],
  ) {
    const saved = await this.local.completeSession(
      houseId,
      sessionId,
      completedAt,
      totalPriceCents,
      purchasedShoppingItemIds,
    );
    await this.enqueue('purchase-session', this.persisted(saved));
    this.changed(houseId);
    void this.syncNow(houseId);
    return saved;
  }

  async cancelSession(
    houseId: string,
    sessionId: string,
    cancelledAt = this.runtime.now().toISOString(),
  ) {
    const saved = await this.local.cancelSession(houseId, sessionId, cancelledAt);
    await this.enqueue('purchase-session', this.persisted(saved));
    this.changed(houseId);
    void this.syncNow(houseId);
    return saved;
  }

  subscribe(houseId: string, changed: () => void, status?: (value: ShoppingSyncStatus) => void) {
    const listener = { changed, status };
    const listeners = this.listeners.get(houseId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(houseId, listeners);
    if (!this.disconnectByHouse.has(houseId)) {
      const trigger = () => void this.syncNow(houseId);
      const removeOnline = this.runtime.addOnlineListener(trigger);
      const removeVisible = this.runtime.addVisibleListener(trigger);
      const removeRealtime = this.remote.subscribe(houseId, (type, entity) => {
        void this.mergeRemote(type, entity).then(() => {
          this.changed(houseId);
          void this.emitStatus(houseId);
        });
      });
      this.disconnectByHouse.set(houseId, () => {
        removeOnline();
        removeVisible();
        removeRealtime();
      });
      trigger();
    }
    void this.getStatus(houseId).then((value) => status?.(value));
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.listeners.delete(houseId);
        this.disconnectByHouse.get(houseId)?.();
        this.disconnectByHouse.delete(houseId);
      }
    };
  }

  async getStatus(houseId: string): Promise<ShoppingSyncStatus> {
    const entries = await this.listOutbox(houseId);
    if (!this.runtime.isOnline()) return { state: 'offline', pending: entries.length };
    if (this.running.has(houseId)) return { state: 'syncing', pending: entries.length };
    if (entries.some((entry) => entry.lastError))
      return { state: 'error', pending: entries.length };
    return { state: entries.length ? 'pending' : 'synced', pending: entries.length };
  }

  syncNow(houseId: string) {
    const current = this.running.get(houseId);
    if (current) return current;
    const task = this.performSync(houseId).finally(() => {
      this.running.delete(houseId);
      void this.emitStatus(houseId);
    });
    this.running.set(houseId, task);
    void this.emitStatus(houseId);
    return task;
  }

  private async performSync(houseId: string) {
    if (!this.runtime.isOnline()) return;
    try {
      const remoteUser = await this.remote.getCurrentUserId();
      if (!remoteUser || remoteUser !== this.actorId) return;
      await this.pull(houseId);
      const entries = (await this.listOutbox(houseId))
        .filter((entry) => entry.actorId === this.actorId)
        .sort((first, second) => {
          const phase = (entry: PurchaseSyncOutboxEntry) =>
            entry.entityType === 'purchase-item'
              ? 1
              : (entry.payload as PersistedPurchaseSession).status === 'active'
                ? 0
                : 2;
          return phase(first) - phase(second) || first.createdAt.localeCompare(second.createdAt);
        });
      for (const entry of entries) {
        if (entry.nextAttemptAt && entry.nextAttemptAt > this.runtime.now().toISOString()) continue;
        try {
          if (entry.entityType === 'purchase-session') {
            const remote = await this.remote.applySession(
              entry.payload as PersistedPurchaseSession,
            );
            await this.mergeRemote('purchase-session', remote);
          } else {
            const item = entry.payload as PurchaseItem;
            const session = await this.local.getSession(houseId, item.purchaseSessionId);
            if (!session) throw new Error('Sessão local da compra não encontrada.');
            const remoteSessionId = session.syncId ?? session.id;
            const remote = await this.remote.applyItem(item, remoteSessionId);
            await this.mergeRemote('purchase-item', remote);
          }
          await this.removeOutboxIfVersion(entry.id, entry.version);
        } catch (error) {
          await this.recordFailure(entry, error);
          break;
        }
      }
      await this.pull(houseId);
      this.changed(houseId);
    } catch {
      /* estado local permanece utilizável; online/visibility tentam novamente */
    }
  }

  private async pull(houseId: string) {
    const snapshot = await this.remote.list(houseId);
    for (const session of snapshot.sessions) await this.mergeRemote('purchase-session', session);
    for (const item of snapshot.items) await this.mergeRemote('purchase-item', item);
  }

  private async mergeRemote(type: PurchaseSyncEntityType, entity: RemotePurchaseEntity) {
    if (type === 'purchase-session') {
      const incoming = entity as PersistedPurchaseSession;
      const sessions = await this.local.listPersistedSessions(incoming.houseId);
      const current = sessions.find(
        (candidate) => candidate.id === incoming.id || candidate.syncId === incoming.id,
      );
      if (current && (await this.hasPending(type, current.id))) return;
      await this.local.putPersistedSession({
        ...incoming,
        id: current?.id ?? incoming.id,
        syncId: incoming.id,
        totalPriceCents: current?.totalPriceCents ?? incoming.totalPriceCents,
      });
      return;
    }
    const incoming = entity as PurchaseItem;
    const [items, sessions] = await Promise.all([
      this.local.listPersistedItems(incoming.houseId),
      this.local.listPersistedSessions(incoming.houseId),
    ]);
    const current = items.find(
      (candidate) => candidate.id === incoming.id || candidate.syncId === incoming.id,
    );
    if (current && (await this.hasPending(type, current.id))) return;
    const localSession = sessions.find(
      (candidate) =>
        candidate.id === incoming.purchaseSessionId ||
        candidate.syncId === incoming.purchaseSessionId,
    );
    await this.local.putPersistedItem({
      ...incoming,
      id: current?.id ?? incoming.id,
      syncId: incoming.id,
      purchaseSessionId: localSession?.id ?? incoming.purchaseSessionId,
    });
  }

  private prepareSession(session: PersistedPurchaseSession): PersistedPurchaseSession {
    const updatedAt = session.updatedAt ?? session.startedAt;
    return {
      ...session,
      syncId: session.syncId ?? (isUuid(session.id) ? session.id : makeUuid()),
      updatedAt,
    };
  }

  private prepareItem(item: PurchaseItem): PurchaseItem {
    const timestamp = item.updatedAt ?? item.purchasedAt;
    return {
      ...item,
      syncId: item.syncId ?? (isUuid(item.id) ? item.id : makeUuid()),
      createdAt: item.createdAt ?? item.purchasedAt,
      updatedAt: timestamp,
    };
  }

  private persisted(session: PurchaseSession): PersistedPurchaseSession {
    const { items, ...persisted } = session;
    void items;
    return persisted;
  }

  private async enqueue(
    type: PurchaseSyncEntityType,
    payload: PersistedPurchaseSession | PurchaseItem,
  ) {
    const entry: PurchaseSyncOutboxEntry = {
      id: outboxId(type, payload.houseId, payload.id),
      entityType: type,
      entityId: payload.id,
      houseId: payload.houseId,
      actorId: this.actorId,
      operation: payload.deletedAt ? 'delete' : 'upsert',
      payload: clone(payload),
      version: versionOf(payload),
      createdAt: this.runtime.now().toISOString(),
      attempts: 0,
    };
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(entry.id, clone(entry));
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(transaction);
    }
    await this.emitStatus(payload.houseId);
  }

  private async listOutbox(houseId: string): Promise<PurchaseSyncOutboxEntry[]> {
    const native = await this.database.getNativeDatabase();
    const values = native
      ? await (async () => {
          const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
          const entries = await requestToPromise(
            transaction.objectStore(CASAE_STORES.syncOutbox).index('houseId').getAll(houseId),
          );
          await transactionToPromise(transaction);
          return entries;
        })()
      : [...this.database.getMemoryDatabase().syncOutbox.values()].filter(
          (entry) => entry.houseId === houseId,
        );
    return values.filter(
      (entry): entry is PurchaseSyncOutboxEntry =>
        entry.entityType === 'purchase-session' || entry.entityType === 'purchase-item',
    );
  }

  private async getOutbox(id: string) {
    const native = await this.database.getNativeDatabase();
    if (!native) return this.database.getMemoryDatabase().syncOutbox.get(id);
    const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
    const entry = await requestToPromise(transaction.objectStore(CASAE_STORES.syncOutbox).get(id));
    await transactionToPromise(transaction);
    return entry;
  }

  private async hasPending(type: PurchaseSyncEntityType, id: string) {
    return this.listOutboxByEntity(type, id);
  }

  private async listOutboxByEntity(type: PurchaseSyncEntityType, id: string) {
    const native = await this.database.getNativeDatabase();
    const all = native
      ? await (async () => {
          const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
          const entries = await requestToPromise(
            transaction.objectStore(CASAE_STORES.syncOutbox).getAll(),
          );
          await transactionToPromise(transaction);
          return entries;
        })()
      : [...this.database.getMemoryDatabase().syncOutbox.values()];
    return all.some((entry) => entry.entityType === type && entry.entityId === id);
  }

  private async removeOutboxIfVersion(id: string, version: string) {
    const current = await this.getOutbox(id);
    if (!current || !('version' in current) || current.version !== version) return;
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.delete(id);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).delete(id);
      await transactionToPromise(transaction);
    }
  }

  private async recordFailure(entry: PurchaseSyncOutboxEntry, error: unknown) {
    const current = await this.getOutbox(entry.id);
    if (!current || !('version' in current) || current.version !== entry.version) return;
    const attempts = entry.attempts + 1;
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
    const failed: PurchaseSyncOutboxEntry = {
      ...entry,
      attempts,
      lastAttemptAt: this.runtime.now().toISOString(),
      lastError: error instanceof Error ? error.message : 'Falha temporária.',
      nextAttemptAt: new Date(this.runtime.now().getTime() + delay).toISOString(),
    };
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(failed.id, failed);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(failed);
      await transactionToPromise(transaction);
    }
    const timer = this.runtime.schedule(() => {
      this.runtime.cancel(timer);
      void this.syncNow(entry.houseId);
    }, delay);
  }

  private nextTimestamp(previous: string) {
    const now = this.runtime.now().toISOString();
    return now > previous ? now : new Date(new Date(previous).getTime() + 1).toISOString();
  }

  private changed(houseId: string) {
    this.listeners.get(houseId)?.forEach((listener) => listener.changed());
  }

  private async emitStatus(houseId: string) {
    const status = await this.getStatus(houseId);
    this.listeners.get(houseId)?.forEach((listener) => listener.status?.(status));
  }
}
