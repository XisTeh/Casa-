import { LEGACY_HOUSE_ID } from '../../domain/house';
import type {
  LegacyShoppingMigration,
  ShoppingListItem,
  ShoppingListItemUpdate,
  ShoppingSyncOutboxEntry,
  ShoppingSyncStatus,
} from '../../domain/shopping-list';
import type { OnlineShoppingListRepository } from '../../domain/shopping-list-repository';
import type { RemoteShoppingStore } from '../supabase/SupabaseShoppingRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalMetadata,
} from '../local-database/CasaeLocalDatabase';
import { LocalShoppingRepository } from './LocalShoppingRepository';

export type ShoppingSyncRuntime = {
  isOnline(): boolean;
  now(): Date;
  addOnlineListener(listener: () => void): () => void;
  addVisibleListener(listener: () => void): () => void;
  schedule(listener: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
};

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

function clone<T>(value: T): T {
  return structuredClone(value);
}

function outboxId(houseId: string, entityId: string) {
  return `shopping-item:${houseId}:${entityId}`;
}

function wins(first: ShoppingListItem, second: ShoppingListItem) {
  const comparison = first.updatedAt.localeCompare(second.updatedAt);
  if (comparison !== 0) return comparison > 0;
  return Boolean(first.deletedAt) && !second.deletedAt;
}

function nextTimestamp(previous: string, now: Date) {
  return new Date(Math.max(now.getTime(), new Date(previous).getTime() + 1)).toISOString();
}

function makeUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export class OfflineFirstShoppingRepository implements OnlineShoppingListRepository {
  private readonly local: LocalShoppingRepository;
  private readonly listeners = new Map<
    string,
    Set<{ changed: () => void; status: (value: ShoppingSyncStatus) => void }>
  >();
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    readonly database: CasaeLocalDatabase,
    private readonly remote: RemoteShoppingStore,
    private readonly currentUserId: string,
    private readonly runtime: ShoppingSyncRuntime = defaultRuntime,
  ) {
    this.local = new LocalShoppingRepository(database);
  }

  initialize() {
    return this.database.initialize();
  }

  list(houseId: string) {
    return this.local.list(houseId);
  }

  async create(item: ShoppingListItem) {
    const prepared = { ...item, deletedAt: undefined, updatedByMemberId: this.currentUserId };
    await this.writeLocal(prepared, 'upsert');
    void this.syncNow(item.houseId);
    return clone(prepared);
  }

  async update(houseId: string, id: string, changes: ShoppingListItemUpdate, actorId?: string) {
    const current = await this.getRaw(id);
    if (!current || current.houseId !== houseId || current.deletedAt)
      throw new Error('Este item não existe mais na lista.');
    const updated: ShoppingListItem = {
      ...current,
      ...changes,
      updatedAt: nextTimestamp(current.updatedAt, this.runtime.now()),
      updatedByMemberId: actorId ?? this.currentUserId,
    };
    await this.writeLocal(updated, 'upsert');
    void this.syncNow(houseId);
    return clone(updated);
  }

  async remove(houseId: string, id: string, actorId?: string) {
    const current = await this.getRaw(id);
    if (!current || current.houseId !== houseId || current.deletedAt)
      throw new Error('Este item não existe mais na lista.');
    const timestamp = nextTimestamp(current.updatedAt, this.runtime.now());
    await this.writeLocal(
      {
        ...current,
        deletedAt: timestamp,
        updatedAt: timestamp,
        updatedByMemberId: actorId ?? this.currentUserId,
      },
      'delete',
    );
    void this.syncNow(houseId);
  }

  subscribe(
    houseId: string,
    onItemsChanged: () => void,
    onStatusChanged: (status: ShoppingSyncStatus) => void,
  ) {
    const listener = { changed: onItemsChanged, status: onStatusChanged };
    const houseListeners = this.listeners.get(houseId) ?? new Set();
    houseListeners.add(listener);
    this.listeners.set(houseId, houseListeners);
    const trigger = () => void this.syncNow(houseId);
    const removeOnline = this.runtime.addOnlineListener(trigger);
    const removeVisible = this.runtime.addVisibleListener(trigger);
    const removeRealtime = this.remote.subscribe(houseId, (item) => {
      void this.mergeRemote(item).then(() => {
        this.emitChanged(houseId);
        void this.emitStatus(houseId);
      });
    });
    void this.getStatus(houseId).then(onStatusChanged);
    trigger();
    return () => {
      houseListeners.delete(listener);
      if (!houseListeners.size) this.listeners.delete(houseId);
      removeOnline();
      removeVisible();
      removeRealtime();
    };
  }

  async getStatus(houseId: string): Promise<ShoppingSyncStatus> {
    const entries = await this.listOutbox(houseId);
    const pending = entries.length;
    if (!this.runtime.isOnline()) return { state: 'offline', pending };
    if (this.running.has(houseId)) return { state: 'syncing', pending };
    if (entries.some((entry) => entry.lastError)) {
      return { state: 'error', pending };
    }
    return { state: pending ? 'pending' : 'synced', pending };
  }

  syncNow(houseId: string) {
    const active = this.running.get(houseId);
    if (active) return active;
    const task = this.performSync(houseId).finally(() => {
      this.running.delete(houseId);
      void this.emitStatus(houseId);
    });
    this.running.set(houseId, task);
    void this.emitStatus(houseId);
    return task;
  }

  async getLegacyMigration(houseId: string): Promise<LegacyShoppingMigration | null> {
    const key = `shopping-list-imported:${houseId}`;
    if (await this.getMetadata(key)) return null;
    const legacy = await this.local.list(LEGACY_HOUSE_ID);
    if (!legacy.length || houseId === LEGACY_HOUSE_ID) return null;
    return {
      count: legacy.length,
      importIntoHouse: async () => {
        const timestamp = this.runtime.now().toISOString();
        for (const item of legacy) {
          await this.writeLocal(
            {
              ...item,
              id: makeUuid(),
              houseId,
              productId: undefined,
              categoryId: undefined,
              houseProductId: undefined,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: undefined,
              addedByMemberId: this.currentUserId,
              updatedByMemberId: this.currentUserId,
            },
            'upsert',
          );
        }
        await this.setMetadata({ key, value: true, completedAt: timestamp });
        this.emitChanged(houseId);
        await this.syncNow(houseId);
      },
    };
  }

  private async performSync(houseId: string) {
    if (!this.runtime.isOnline()) return;
    try {
      if ((await this.remote.getCurrentUserId()) !== this.currentUserId) return;
      const remoteItems = await this.remote.list(houseId);
      for (const item of remoteItems) await this.mergeRemote(item);
      const pending = await this.listOutbox(houseId);
      for (const entry of pending) {
        if (entry.nextAttemptAt && entry.nextAttemptAt > this.runtime.now().toISOString()) continue;
        try {
          const authoritative = await this.remote.apply(entry.payload);
          await this.mergeRemote(authoritative);
        } catch (error) {
          await this.recordFailure(entry, error);
        }
      }
      const finalRemote = await this.remote.list(houseId);
      for (const item of finalRemote) await this.mergeRemote(item);
      this.emitChanged(houseId);
    } catch {
      // A lista local permanece utilizável; online/visibility/reload tentarão novamente.
    }
  }

  private async writeLocal(item: ShoppingListItem, operation: 'upsert' | 'delete') {
    await this.initialize();
    const entry: ShoppingSyncOutboxEntry = {
      id: outboxId(item.houseId, item.id),
      entityType: 'shopping-item',
      entityId: item.id,
      houseId: item.houseId,
      actorId: item.updatedByMemberId ?? item.addedByMemberId ?? this.currentUserId,
      operation,
      payload: clone(item),
      version: item.updatedAt,
      createdAt: this.runtime.now().toISOString(),
      attempts: 0,
    };
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().shoppingItems.set(item.id, clone(item));
      this.database.getMemoryDatabase().syncOutbox.set(entry.id, entry);
    } else {
      const transaction = native.transaction(
        [CASAE_STORES.shoppingItems, CASAE_STORES.syncOutbox],
        'readwrite',
      );
      transaction.objectStore(CASAE_STORES.shoppingItems).put(item);
      transaction.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(transaction);
    }
    this.emitChanged(item.houseId);
    await this.emitStatus(item.houseId);
  }

  private async mergeRemote(remote: ShoppingListItem) {
    await this.initialize();
    const local = await this.getRaw(remote.id);
    const mergedRemote: ShoppingListItem = local
      ? {
          ...remote,
          productId: remote.productId ?? local.productId,
          categoryId: remote.categoryId ?? local.categoryId,
          houseProductId: local.houseProductId,
          barcode: local.barcode,
        }
      : remote;
    const pendingId = outboxId(remote.houseId, remote.id);
    const pending = await this.getOutbox(pendingId);
    const ownPending = pending?.actorId === this.currentUserId ? pending : undefined;
    if (local && wins(local, mergedRemote) && ownPending) return;
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.database.getMemoryDatabase().shoppingItems.set(remote.id, clone(mergedRemote));
      if (ownPending && !wins(ownPending.payload, mergedRemote)) {
        this.database.getMemoryDatabase().syncOutbox.delete(pendingId);
      }
      return;
    }
    const transaction = native.transaction(
      [CASAE_STORES.shoppingItems, CASAE_STORES.syncOutbox],
      'readwrite',
    );
    transaction.objectStore(CASAE_STORES.shoppingItems).put(mergedRemote);
    if (ownPending && !wins(ownPending.payload, mergedRemote)) {
      transaction.objectStore(CASAE_STORES.syncOutbox).delete(pendingId);
    }
    await transactionToPromise(transaction);
  }

  private async getRaw(id: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) return clone(this.database.getMemoryDatabase().shoppingItems.get(id));
    const transaction = native.transaction(CASAE_STORES.shoppingItems, 'readonly');
    const item = await requestToPromise(
      transaction.objectStore(CASAE_STORES.shoppingItems).get(id) as IDBRequest<
        ShoppingListItem | undefined
      >,
    );
    await transactionToPromise(transaction);
    return item && clone(item);
  }

  private async listOutbox(houseId: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native)
      return [...this.database.getMemoryDatabase().syncOutbox.values()]
        .filter(
          (entry): entry is ShoppingSyncOutboxEntry =>
            entry.entityType === 'shopping-item' &&
            entry.houseId === houseId &&
            entry.actorId === this.currentUserId,
        )
        .map(clone)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
    const entries = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.syncOutbox)
        .index('houseId')
        .getAll(houseId) as IDBRequest<ShoppingSyncOutboxEntry[]>,
    );
    await transactionToPromise(transaction);
    return entries
      .filter(
        (entry) => entry.entityType === 'shopping-item' && entry.actorId === this.currentUserId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async getOutbox(id: string) {
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const entry = this.database.getMemoryDatabase().syncOutbox.get(id);
      return entry?.entityType === 'shopping-item' ? clone(entry) : undefined;
    }
    const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
    const entry = await requestToPromise(
      transaction.objectStore(CASAE_STORES.syncOutbox).get(id) as IDBRequest<
        ShoppingSyncOutboxEntry | undefined
      >,
    );
    await transactionToPromise(transaction);
    return entry && clone(entry);
  }

  private async recordFailure(entry: ShoppingSyncOutboxEntry, error: unknown) {
    const attempts = entry.attempts + 1;
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
    const failed: ShoppingSyncOutboxEntry = {
      ...entry,
      attempts,
      lastAttemptAt: this.runtime.now().toISOString(),
      lastError: error instanceof Error ? error.message : 'Falha temporária de sincronização.',
      nextAttemptAt: new Date(this.runtime.now().getTime() + delay).toISOString(),
    };
    const native = await this.database.getNativeDatabase();
    if (!native) {
      const current = this.database.getMemoryDatabase().syncOutbox.get(entry.id);
      if (current?.version !== entry.version || current.actorId !== entry.actorId) return;
      this.database.getMemoryDatabase().syncOutbox.set(failed.id, failed);
    } else {
      const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      const store = transaction.objectStore(CASAE_STORES.syncOutbox);
      const current = await requestToPromise(
        store.get(entry.id) as IDBRequest<ShoppingSyncOutboxEntry | undefined>,
      );
      if (current?.version !== entry.version || current.actorId !== entry.actorId) {
        await transactionToPromise(transaction);
        return;
      }
      store.put(failed);
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

  private emitChanged(houseId: string) {
    this.listeners.get(houseId)?.forEach((listener) => listener.changed());
  }

  private async emitStatus(houseId: string) {
    const status = await this.getStatus(houseId);
    this.listeners.get(houseId)?.forEach((listener) => listener.status(status));
  }
}
