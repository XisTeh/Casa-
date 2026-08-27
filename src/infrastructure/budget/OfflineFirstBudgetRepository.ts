import type { HouseBudget } from '../../domain/budget';
import type { BudgetRepository, BudgetSyncRepository } from '../../domain/budget-repository';
import type { BudgetSyncOutboxEntry } from '../../domain/budget-sync';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import type { ShoppingSyncRuntime } from '../shopping/OfflineFirstShoppingRepository';
import type { RemoteBudgetStore } from '../supabase/SupabaseBudgetRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';
import { LocalBudgetRepository } from './LocalBudgetRepository';

const clone = <T>(value: T): T => structuredClone(value);
const makeUuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        return (character === 'x' ? random : (random & 3) | 8).toString(16);
      });
const outboxId = (houseId: string, id: string) => `house-budget:${houseId}:${id}`;
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

export class OfflineFirstBudgetRepository implements BudgetRepository, BudgetSyncRepository {
  private readonly local: LocalBudgetRepository;
  private readonly listeners = new Map<
    string,
    Set<{ changed: () => void; status?: (status: ShoppingSyncStatus) => void }>
  >();
  private readonly disconnectByHouse = new Map<string, () => void>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    readonly database: CasaeLocalDatabase,
    private readonly remote: RemoteBudgetStore,
    private readonly actorId: string,
    private readonly runtime: ShoppingSyncRuntime = defaultRuntime,
  ) {
    this.local = new LocalBudgetRepository(database);
  }

  initialize() {
    return this.local.initialize();
  }
  list(houseId: string) {
    return this.local.list(houseId);
  }
  getByMonth(houseId: string, year: number, month: number) {
    return this.local.getByMonth(houseId, year, month);
  }

  async save(budget: HouseBudget) {
    const prepared: HouseBudget = {
      ...budget,
      syncId: budget.syncId ?? makeUuid(),
      createdById: budget.createdById ?? this.actorId,
      updatedById: this.actorId,
    };
    const saved = await this.local.save(prepared);
    await this.enqueue(saved);
    this.changed(saved.houseId);
    void this.syncNow(saved.houseId);
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
      const removeRealtime = this.remote.subscribe(houseId, (budget) => {
        void this.mergeRemote(budget).then(() => {
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
      if ((await this.remote.getCurrentUserId()) !== this.actorId) return;
      await this.enqueueUnsynced(houseId);
      for (const remote of await this.remote.list(houseId)) await this.mergeRemote(remote);
      const entries = (await this.listOutbox(houseId))
        .filter((entry) => entry.actorId === this.actorId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const entry of entries) {
        if (entry.nextAttemptAt && entry.nextAttemptAt > this.runtime.now().toISOString()) continue;
        try {
          const authoritative = await this.remote.apply(entry.payload);
          await this.removeOutboxIfVersion(entry.id, entry.version);
          await this.mergeRemote(authoritative);
        } catch (error) {
          await this.recordFailure(entry, error);
          break;
        }
      }
      for (const remote of await this.remote.list(houseId)) await this.mergeRemote(remote);
      this.changed(houseId);
    } catch {
      /* o orçamento local continua disponível; online/visibility tentam novamente */
    }
  }

  private async enqueueUnsynced(houseId: string) {
    for (const budget of await this.local.list(houseId)) {
      if (budget.syncId) continue;
      const prepared = {
        ...budget,
        syncId: makeUuid(),
        createdById: budget.createdById ?? this.actorId,
        updatedById: this.actorId,
      };
      await this.local.save(prepared);
      await this.enqueue(prepared);
    }
  }

  private async mergeRemote(remote: HouseBudget) {
    const budgets = await this.local.list(remote.houseId);
    const current = budgets.find(
      (candidate) =>
        candidate.id === remote.id ||
        candidate.syncId === remote.id ||
        (candidate.year === remote.year && candidate.month === remote.month),
    );
    const pending = current
      ? await this.getOutbox(outboxId(remote.houseId, current.id))
      : undefined;
    const ownPending = pending?.actorId === this.actorId ? pending : undefined;
    if (ownPending && ownPending.version > remote.updatedAt) return;
    await this.local.save({
      ...remote,
      id: current?.id ?? remote.id,
      syncId: remote.id,
    });
    if (ownPending) await this.removeOutboxIfVersion(ownPending.id, ownPending.version);
  }

  private async enqueue(payload: HouseBudget) {
    const entry: BudgetSyncOutboxEntry = {
      id: outboxId(payload.houseId, payload.id),
      entityType: 'house-budget',
      entityId: payload.id,
      houseId: payload.houseId,
      actorId: this.actorId,
      operation: 'upsert',
      payload: clone(payload),
      version: payload.updatedAt,
      createdAt: this.runtime.now().toISOString(),
      attempts: 0,
    };
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.set(entry.id, entry);
    else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      transaction.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(transaction);
    }
    await this.emitStatus(payload.houseId);
  }

  private async listOutbox(houseId: string): Promise<BudgetSyncOutboxEntry[]> {
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
      (entry): entry is BudgetSyncOutboxEntry =>
        entry.entityType === 'house-budget' && entry.actorId === this.actorId,
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

  private async recordFailure(entry: BudgetSyncOutboxEntry, error: unknown) {
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
    const failed: BudgetSyncOutboxEntry = {
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

  private changed(houseId: string) {
    this.listeners.get(houseId)?.forEach((listener) => listener.changed());
  }

  private async emitStatus(houseId: string) {
    const status = await this.getStatus(houseId);
    this.listeners.get(houseId)?.forEach((listener) => listener.status?.(status));
  }
}
