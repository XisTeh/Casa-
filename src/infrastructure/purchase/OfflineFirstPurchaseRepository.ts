import type {
  PersistedPurchaseSession,
  PurchaseItem,
  PurchaseSession,
} from '../../domain/purchase';
import type { PurchaseRepository } from '../../domain/purchase-repository';
import type {
  LegacyPurchaseMigration,
  PurchaseSyncEntityType,
  PurchaseSyncOutboxEntry,
  PurchaseSyncRepository,
} from '../../domain/purchase-sync';
import { LEGACY_HOUSE_ID } from '../../domain/house';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import type { ShoppingSyncRuntime } from '../shopping/OfflineFirstShoppingRepository';
import type {
  RemotePurchaseSnapshot,
  RemotePurchaseStore,
} from '../supabase/SupabasePurchaseRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalMetadata,
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
const outboxId = (type: PurchaseSyncEntityType, houseId: string, actorId: string, id: string) =>
  `${type}:${houseId}:${actorId}:${id}`;
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
  private readonly dirty = new Set<string>();
  private readonly mutationTails = new Map<string, Promise<void>>();

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
    return this.listActiveSessions(houseId).then((sessions) => sessions[0] ?? null);
  }
  async getSession(houseId: string, sessionId: string) {
    const session = await this.local.getSession(houseId, sessionId);
    return session && (await this.isSharedSession(houseId, session)) ? session : null;
  }
  async listActiveSessions(houseId: string) {
    const sessions = await this.local.listActiveSessions(houseId);
    return this.filterSharedSessions(houseId, sessions);
  }
  async listCompletedSessions(houseId: string) {
    const sessions = await this.local.listCompletedSessions(houseId);
    return this.filterSharedSessions(houseId, sessions);
  }

  async createSession(session: PersistedPurchaseSession) {
    return this.runMutation(session.houseId, async () => {
      const prepared = this.prepareSession(session);
      const saved = await this.local.createSession(prepared);
      await this.enqueue('purchase-session', prepared);
      this.changed(session.houseId);
      void this.syncNow(session.houseId);
      return saved;
    });
  }

  async savePurchasedItem(houseId: string, item: PurchaseItem) {
    return this.runMutation(houseId, async () => {
      const prepared = this.prepareItem(item);
      const saved = await this.local.savePurchasedItem(houseId, prepared);
      await this.enqueue('purchase-item', prepared);
      this.changed(houseId);
      void this.syncNow(houseId);
      return saved;
    });
  }

  async removePurchasedItem(houseId: string, sessionId: string, purchaseItemId: string) {
    return this.runMutation(houseId, async () => {
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
    });
  }

  async completeSession(
    houseId: string,
    sessionId: string,
    completedAt: string,
    totalPriceCents: number,
    purchasedShoppingItemIds: string[],
  ) {
    return this.runMutation(houseId, async () => {
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
    });
  }

  async cancelSession(
    houseId: string,
    sessionId: string,
    cancelledAt = this.runtime.now().toISOString(),
  ) {
    return this.runMutation(houseId, async () => {
      const saved = await this.local.cancelSession(houseId, sessionId, cancelledAt);
      await this.enqueue('purchase-session', this.persisted(saved));
      this.changed(houseId);
      void this.syncNow(houseId);
      return saved;
    });
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
      const removeRealtime = this.remote.subscribe(houseId, () => void this.syncNow(houseId));
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
    if (current) {
      this.dirty.add(houseId);
      return current;
    }
    const task = this.performUntilClean(houseId).finally(() => {
      this.running.delete(houseId);
      this.dirty.delete(houseId);
      void this.emitStatus(houseId);
    });
    this.running.set(houseId, task);
    void this.emitStatus(houseId);
    return task;
  }

  private async performUntilClean(houseId: string) {
    do {
      this.dirty.delete(houseId);
      await this.waitForMutations(houseId);
      await this.performSync(houseId);
    } while (this.dirty.delete(houseId));
  }

  async getLegacyMigration(houseId: string): Promise<LegacyPurchaseMigration | null> {
    const key = `purchase-history-imported:${houseId}`;
    if (await this.getMetadata(key)) return null;
    const target = await this.unsyncedCompleted(houseId);
    const legacy =
      houseId === LEGACY_HOUSE_ID
        ? { sessions: [], items: [] }
        : await this.unsyncedCompleted(LEGACY_HOUSE_ID);
    const sessions = [...target.sessions, ...legacy.sessions];
    const sessionIds = new Set(sessions.map((session) => session.id));
    const items = [...target.items, ...legacy.items].filter((item) =>
      sessionIds.has(item.purchaseSessionId),
    );
    if (!sessions.length) {
      await this.setMetadata({ key, value: true, completedAt: this.runtime.now().toISOString() });
      return null;
    }
    return {
      sessions: sessions.length,
      items: items.filter((item) => !item.deletedAt).length,
      importIntoHouse: async () => {
        if (await this.getMetadata(key)) return;
        for (const source of sessions) {
          const preparedSession: PersistedPurchaseSession = {
            ...source,
            houseId,
            syncId:
              source.syncId ??
              (await stableUuid(
                `remote:purchase-session:${houseId}:${source.houseId}:${source.id}`,
              )),
            deletedAt: undefined,
          };
          const preparedItems = await Promise.all(
            items
              .filter((item) => item.purchaseSessionId === source.id)
              .map(async (item) => ({
                ...item,
                houseId,
                syncId:
                  item.syncId ??
                  (await stableUuid(`remote:purchase-item:${houseId}:${item.houseId}:${item.id}`)),
              })),
          );
          await this.stageLegacySession(preparedSession, preparedItems);
        }
        await this.setMetadata({
          key,
          value: true,
          completedAt: this.runtime.now().toISOString(),
        });
        this.changed(houseId);
        await this.syncNow(houseId);
      },
    };
  }

  private async performSync(houseId: string) {
    if (!this.runtime.isOnline()) return;
    try {
      const remoteUser = await this.remote.getCurrentUserId();
      if (!remoteUser || remoteUser !== this.actorId) return;
      await this.restoreActorPending(houseId);
      await this.pull(houseId);
      const remoteSnapshot = await this.remote.list(houseId);
      const remoteSessions = new Map(
        remoteSnapshot.sessions.map((session) => [session.syncId ?? session.id, session]),
      );
      const terminalSessionsToRestore = new Map<string, PersistedPurchaseSession>();
      const entries = (await this.listOutbox(houseId)).sort((first, second) =>
        first.createdAt.localeCompare(second.createdAt),
      );
      const eligible = (entry: PurchaseSyncOutboxEntry) =>
        !entry.nextAttemptAt || entry.nextAttemptAt <= this.runtime.now().toISOString();

      for (const entry of entries) {
        if (
          entry.entityType !== 'purchase-session' ||
          (entry.payload as PersistedPurchaseSession).status !== 'active' ||
          !eligible(entry)
        )
          continue;
        try {
          const applied = await this.remote.applySession(entry.payload as PersistedPurchaseSession);
          remoteSessions.set(applied.syncId ?? applied.id, applied);
          await this.removeOutboxIfVersion(entry.id, entry.version);
        } catch (error) {
          await this.recordFailure(entry, error);
          return;
        }
      }

      for (const entry of entries) {
        if (entry.entityType !== 'purchase-item' || !eligible(entry)) continue;
        try {
          const item = entry.payload as PurchaseItem;
          const session = await this.local.getSession(houseId, item.purchaseSessionId);
          if (!session) throw new Error('Sessão local da compra não encontrada.');
          const persistedSession = this.persisted(session);
          if (persistedSession.status !== 'active') {
            terminalSessionsToRestore.set(
              persistedSession.syncId ?? persistedSession.id,
              persistedSession,
            );
            const hasTerminalEntry = entries.some((candidate) => {
              if (candidate.entityType !== 'purchase-session') return false;
              const payload = candidate.payload as PersistedPurchaseSession;
              return (
                payload.status !== 'active' &&
                (payload.syncId ?? payload.id) === (persistedSession.syncId ?? persistedSession.id)
              );
            });
            if (!hasTerminalEntry) await this.enqueue('purchase-session', persistedSession);
          }
          const remoteSession = await this.ensureRemoteSessionActive(
            persistedSession,
            remoteSessions,
          );
          await this.remote.applyItem(item, remoteSession.syncId ?? remoteSession.id);
          await this.removeOutboxIfVersion(entry.id, entry.version);
        } catch (error) {
          await this.recordFailure(entry, error);
          return;
        }
      }

      const pendingAfterItems = await this.listOutbox(houseId);
      if (
        pendingAfterItems.some((entry) => entry.entityType === 'purchase-item' && eligible(entry))
      ) {
        this.dirty.add(houseId);
        return;
      }

      const terminalEntries = pendingAfterItems
        .filter(
          (entry) =>
            entry.entityType === 'purchase-session' &&
            (entry.payload as PersistedPurchaseSession).status !== 'active' &&
            eligible(entry),
        )
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
      terminalEntries.forEach((entry) => {
        const session = entry.payload as PersistedPurchaseSession;
        terminalSessionsToRestore.set(session.syncId ?? session.id, session);
      });

      for (const [remoteId, session] of terminalSessionsToRestore) {
        if (this.hasPendingItemsForSession(pendingAfterItems, session)) continue;
        try {
          let current = remoteSessions.get(remoteId);
          if (!current) current = await this.ensureRemoteSessionActive(session, remoteSessions);
          const applied = await this.remote.applySession({
            ...session,
            updatedAt: this.nextTimestamp([versionOf(session), versionOf(current)].sort().at(-1)!),
          });
          remoteSessions.set(applied.syncId ?? applied.id, applied);
          const entry = terminalEntries.find((candidate) => {
            const payload = candidate.payload as PersistedPurchaseSession;
            return (payload.syncId ?? payload.id) === remoteId;
          });
          if (entry) await this.removeOutboxIfVersion(entry.id, entry.version);
        } catch (error) {
          const entry = terminalEntries.find((candidate) => {
            const payload = candidate.payload as PersistedPurchaseSession;
            return (payload.syncId ?? payload.id) === remoteId;
          });
          if (entry) await this.recordFailure(entry, error);
          return;
        }
      }
      await this.pull(houseId);
      this.changed(houseId);
    } catch {
      /* estado local permanece utilizável; online/visibility tentam novamente */
    }
  }

  private async ensureRemoteSessionActive(
    session: PersistedPurchaseSession,
    remoteSessions: Map<string, PersistedPurchaseSession>,
  ) {
    const remoteId = session.syncId ?? session.id;
    const current = remoteSessions.get(remoteId);
    if (current?.status === 'active') return current;
    const previous = current
      ? [versionOf(session), versionOf(current)].sort().at(-1)!
      : session.startedAt;
    const active = await this.remote.applySession({
      ...session,
      status: 'active',
      completedAt: undefined,
      cancelledAt: undefined,
      updatedAt: current ? this.nextTimestamp(previous) : session.startedAt,
    });
    remoteSessions.set(active.syncId ?? active.id, active);
    return active;
  }

  private hasPendingItemsForSession(
    entries: PurchaseSyncOutboxEntry[],
    session: PersistedPurchaseSession,
  ) {
    const references = new Set([session.id, session.syncId].filter(Boolean));
    return entries.some(
      (entry) =>
        entry.entityType === 'purchase-item' &&
        references.has((entry.payload as PurchaseItem).purchaseSessionId),
    );
  }

  private runMutation<T>(houseId: string, operation: () => Promise<T>) {
    const previous = this.mutationTails.get(houseId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(houseId, tail);
    void tail.finally(() => {
      if (this.mutationTails.get(houseId) === tail) this.mutationTails.delete(houseId);
    });
    return result;
  }

  private async waitForMutations(houseId: string) {
    await this.mutationTails.get(houseId);
  }

  private async pull(houseId: string) {
    const snapshot = await this.remote.list(houseId);
    await this.reconcileRemoteSnapshot(houseId, snapshot);
  }

  private async unsyncedCompleted(houseId: string) {
    const sessions = (await this.local.listPersistedSessions(houseId)).filter(
      (session) => session.status === 'completed' && !session.syncId && !session.deletedAt,
    );
    const sessionIds = new Set(sessions.map((session) => session.id));
    const items = (await this.local.listPersistedItems(houseId)).filter((item) =>
      sessionIds.has(item.purchaseSessionId),
    );
    return { sessions, items };
  }

  private async restoreActorPending(houseId: string) {
    const entries = await this.listOutbox(houseId);
    const sessionEntries = entries.filter(
      (entry) => entry.entityType === 'purchase-session',
    ) as Array<PurchaseSyncOutboxEntry & { payload: PersistedPurchaseSession }>;
    const itemEntries = entries.filter((entry) => entry.entityType === 'purchase-item') as Array<
      PurchaseSyncOutboxEntry & { payload: PurchaseItem }
    >;
    for (const entry of sessionEntries) await this.local.putPersistedSession(entry.payload);
    for (const entry of itemEntries) await this.local.putPersistedItem(entry.payload);
  }

  private async filterSharedSessions(houseId: string, sessions: PurchaseSession[]) {
    const pending = await this.listOutbox(houseId);
    const pendingSessionIds = new Set<string>();
    pending.forEach((entry) => {
      if (entry.entityType === 'purchase-session') {
        const payload = entry.payload as PersistedPurchaseSession;
        pendingSessionIds.add(entry.entityId);
        pendingSessionIds.add(payload.id);
        if (payload.syncId) pendingSessionIds.add(payload.syncId);
      } else {
        pendingSessionIds.add((entry.payload as PurchaseItem).purchaseSessionId);
      }
    });
    return sessions.filter(
      (session) =>
        Boolean(session.syncId) ||
        pendingSessionIds.has(session.id) ||
        Boolean(session.syncId && pendingSessionIds.has(session.syncId)),
    );
  }

  private async isSharedSession(houseId: string, session: PurchaseSession) {
    return (await this.filterSharedSessions(houseId, [session])).length === 1;
  }

  private async reconcileRemoteSnapshot(houseId: string, snapshot: RemotePurchaseSnapshot) {
    const [localSessions, localItems, pending] = await Promise.all([
      this.local.listPersistedSessions(houseId),
      this.local.listPersistedItems(houseId),
      this.listOutbox(houseId),
    ]);
    const sessionEntries = pending.filter((entry) => entry.entityType === 'purchase-session');
    const itemEntries = pending.filter((entry) => entry.entityType === 'purchase-item');
    const identifiers = (value: { id: string; syncId?: string }) =>
      new Set([value.id, value.syncId].filter((id): id is string => Boolean(id)));
    const entryMatches = (
      entry: PurchaseSyncOutboxEntry,
      entity: PersistedPurchaseSession | PurchaseItem,
    ) => {
      const entityIds = identifiers(entity);
      const payload = entry.payload as PersistedPurchaseSession | PurchaseItem;
      return [entry.entityId, payload.id, payload.syncId].some(
        (id) => Boolean(id) && entityIds.has(id!),
      );
    };
    const itemParentReferences = new Set(
      itemEntries.map((entry) => (entry.payload as PurchaseItem).purchaseSessionId),
    );
    const sessionIsPending = (session: PersistedPurchaseSession) =>
      sessionEntries.some((entry) => entryMatches(entry, session)) ||
      [session.id, session.syncId].some((id) => Boolean(id) && itemParentReferences.has(id!));
    const itemIsPending = (item: PurchaseItem) =>
      itemEntries.some((entry) => entryMatches(entry, item));
    const allocateLegacyId = (base: string, occupied: Set<string>) => {
      let candidate = `legacy:${houseId}:${base}`;
      let suffix = 1;
      while (occupied.has(candidate)) candidate = `legacy:${houseId}:${base}:${suffix++}`;
      occupied.add(candidate);
      return candidate;
    };

    const desiredSessions = new Map<string, PersistedPurchaseSession>();
    const remoteSessionIds = new Set(snapshot.sessions.map((session) => session.id));
    const occupiedSessionIds = new Set(remoteSessionIds);
    const localSessionKey = new Map<string, string>();

    for (const session of localSessions) {
      if (session.syncId || sessionIsPending(session)) continue;
      const id = occupiedSessionIds.has(session.id)
        ? allocateLegacyId(session.id, occupiedSessionIds)
        : session.id;
      occupiedSessionIds.add(id);
      localSessionKey.set(session.id, id);
      desiredSessions.set(id, {
        ...session,
        id,
        legacyId: id === session.id ? session.legacyId : (session.legacyId ?? session.id),
      });
    }

    for (const session of localSessions.filter(sessionIsPending)) {
      const id = desiredSessions.has(session.id)
        ? allocateLegacyId(session.id, occupiedSessionIds)
        : session.id;
      occupiedSessionIds.add(id);
      localSessionKey.set(session.id, id);
      desiredSessions.set(id, {
        ...session,
        id,
        legacyId: id === session.id ? session.legacyId : (session.legacyId ?? session.id),
      });
    }

    const remoteSessionKey = new Map<string, string>();
    const remoteTotals = new Map<string, number>();
    snapshot.items.forEach((item) => {
      if (!item.deletedAt)
        remoteTotals.set(
          item.purchaseSessionId,
          (remoteTotals.get(item.purchaseSessionId) ?? 0) + item.totalPriceCents,
        );
    });
    for (const remote of snapshot.sessions) {
      const current = localSessions.find(
        (candidate) =>
          candidate.syncId === remote.id ||
          (candidate.id === remote.id && candidate.syncId === remote.id),
      );
      if (current && sessionIsPending(current)) {
        const id = localSessionKey.get(current.id) ?? current.id;
        remoteSessionKey.set(remote.id, id);
        continue;
      }
      remoteSessionKey.set(remote.id, remote.id);
      desiredSessions.set(remote.id, {
        ...remote,
        id: remote.id,
        syncId: remote.id,
        legacyId:
          current?.legacyId ?? (current && current.id !== remote.id ? current.id : remote.legacyId),
        totalPriceCents: remoteTotals.get(remote.id) ?? 0,
      });
    }

    const desiredItems = new Map<string, PurchaseItem>();
    const remoteItemIds = new Set(snapshot.items.map((item) => item.id));
    const occupiedItemIds = new Set(remoteItemIds);

    for (const item of localItems) {
      const legacyParent = !item.syncId ? localSessionKey.get(item.purchaseSessionId) : undefined;
      if (!legacyParent || itemIsPending(item)) continue;
      const id = occupiedItemIds.has(item.id)
        ? allocateLegacyId(item.id, occupiedItemIds)
        : item.id;
      occupiedItemIds.add(id);
      desiredItems.set(id, {
        ...item,
        id,
        purchaseSessionId: legacyParent,
        legacyId: id === item.id ? item.legacyId : (item.legacyId ?? item.id),
      });
    }

    for (const item of localItems.filter(itemIsPending)) {
      const parentSession = localSessions.find((session) => session.id === item.purchaseSessionId);
      const parentReference =
        localSessionKey.get(item.purchaseSessionId) ??
        parentSession?.syncId ??
        item.purchaseSessionId;
      const parentId =
        remoteSessionKey.get(parentReference) ??
        localSessionKey.get(parentReference) ??
        parentReference;
      if (!desiredSessions.has(parentId)) continue;
      const id = desiredItems.has(item.id) ? allocateLegacyId(item.id, occupiedItemIds) : item.id;
      occupiedItemIds.add(id);
      desiredItems.set(id, {
        ...item,
        id,
        purchaseSessionId: parentId,
        legacyId: id === item.id ? item.legacyId : (item.legacyId ?? item.id),
      });
    }

    for (const remote of snapshot.items) {
      const parentId = remoteSessionKey.get(remote.purchaseSessionId);
      if (!parentId) continue;
      const current = localItems.find(
        (candidate) =>
          candidate.syncId === remote.id ||
          (candidate.id === remote.id && candidate.syncId === remote.id),
      );
      if (current && itemIsPending(current)) continue;
      desiredItems.set(remote.id, {
        ...remote,
        id: remote.id,
        syncId: remote.id,
        legacyId:
          current?.legacyId ?? (current && current.id !== remote.id ? current.id : remote.legacyId),
        purchaseSessionId: parentId,
      });
    }

    await this.local.replaceHouseSnapshot(
      houseId,
      [...desiredSessions.values()],
      [...desiredItems.values()],
    );
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
    const entry = this.createOutboxEntry(type, payload);
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(entry.id, clone(entry));
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(transaction);
    }
    await this.emitStatus(payload.houseId);
  }

  private createOutboxEntry(
    type: PurchaseSyncEntityType,
    payload: PersistedPurchaseSession | PurchaseItem,
  ): PurchaseSyncOutboxEntry {
    return {
      id: outboxId(type, payload.houseId, this.actorId, payload.id),
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
  }

  private async stageLegacySession(session: PersistedPurchaseSession, items: PurchaseItem[]) {
    const sessionEntry = this.createOutboxEntry('purchase-session', session);
    const itemEntries = items.map((item) => this.createOutboxEntry('purchase-item', item));
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const memory = this.database.getMemoryDatabase();
      memory.purchaseSessions.set(session.id, clone(session));
      memory.syncOutbox.set(sessionEntry.id, clone(sessionEntry));
      items.forEach((item, index) => {
        memory.purchaseItems.set(item.id, clone(item));
        memory.syncOutbox.set(itemEntries[index]!.id, clone(itemEntries[index]!));
      });
    } else {
      const transaction = native.transaction(
        [CASAE_STORES.purchaseSessions, CASAE_STORES.purchaseItems, CASAE_STORES.syncOutbox],
        'readwrite',
      );
      transaction.objectStore(CASAE_STORES.purchaseSessions).put(session);
      transaction.objectStore(CASAE_STORES.syncOutbox).put(sessionEntry);
      items.forEach((item, index) => {
        transaction.objectStore(CASAE_STORES.purchaseItems).put(item);
        transaction.objectStore(CASAE_STORES.syncOutbox).put(itemEntries[index]!);
      });
      await transactionToPromise(transaction);
    }
    await this.emitStatus(session.houseId);
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
        (entry.entityType === 'purchase-session' || entry.entityType === 'purchase-item') &&
        entry.actorId === this.actorId,
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

  private async removeOutboxIfVersion(id: string, version: string) {
    const current = await this.getOutbox(id);
    if (
      !current ||
      !('version' in current) ||
      current.version !== version ||
      current.actorId !== this.actorId
    )
      return;
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
    if (
      !current ||
      !('version' in current) ||
      current.version !== entry.version ||
      current.actorId !== entry.actorId
    )
      return;
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

  private async getMetadata(key: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) return this.database.getMemoryDatabase().metadata.get(key)?.value === true;
    const transaction = native.transaction(CASAE_STORES.metadata, 'readonly');
    const value = await requestToPromise(
      transaction.objectStore(CASAE_STORES.metadata).get(key) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    await transactionToPromise(transaction);
    return value?.value === true;
  }

  private async setMetadata(value: LocalMetadata) {
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().metadata.set(value.key, value);
    else {
      const transaction = native.transaction(CASAE_STORES.metadata, 'readwrite');
      transaction.objectStore(CASAE_STORES.metadata).put(value);
      await transactionToPromise(transaction);
    }
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

async function stableUuid(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
