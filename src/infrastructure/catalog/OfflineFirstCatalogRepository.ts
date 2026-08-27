import {
  normalizeCatalogName,
  type Category,
  type DefaultCategoryDefinition,
  type Product,
} from '../../domain/catalog';
import type { CategoryRepository } from '../../domain/category-repository';
import type {
  CatalogEntityType,
  CatalogSyncOutboxEntry,
  LegacyCatalogMigration,
} from '../../domain/catalog-sync';
import { LEGACY_HOUSE_ID } from '../../domain/house';
import type { ProductRepository } from '../../domain/product-repository';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import type { Store, StoreUpdate } from '../../domain/store';
import type { StoreRepository } from '../../domain/store-repository';
import type { ShoppingSyncRuntime } from '../shopping/OfflineFirstShoppingRepository';
import type { CatalogSyncEntity, RemoteCatalogStore } from '../supabase/SupabaseCatalogRepository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalMetadata,
} from '../local-database/CasaeLocalDatabase';
import { LocalCategoryRepository } from './LocalCategoryRepository';
import { LocalProductRepository } from './LocalProductRepository';
import { LocalStoreRepository } from '../store/LocalStoreRepository';

const clone = <T>(value: T): T => structuredClone(value);
const makeUuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        return (character === 'x' ? random : (random & 3) | 8).toString(16);
      });
const outboxId = (type: CatalogEntityType, houseId: string, id: string) =>
  `${type}:${houseId}:${id}`;
const wins = (first: CatalogSyncEntity, second: CatalogSyncEntity) =>
  first.updatedAt > second.updatedAt ||
  (first.updatedAt === second.updatedAt && Boolean(first.deletedAt) && !second.deletedAt);
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

export class OfflineFirstCatalogSync {
  readonly categories: CategoryRepository;
  readonly products: ProductRepository;
  readonly stores: StoreRepository;
  private readonly localCategories: LocalCategoryRepository;
  private readonly localProducts: LocalProductRepository;
  private readonly localStores: LocalStoreRepository;
  private readonly listeners = new Map<
    string,
    Set<{ changed: () => void; status?: (status: ShoppingSyncStatus) => void }>
  >();
  private readonly disconnectByHouse = new Map<string, () => void>();
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    readonly database: CasaeLocalDatabase,
    private readonly remote: RemoteCatalogStore,
    private readonly runtime: ShoppingSyncRuntime = defaultRuntime,
    private readonly actorId?: string,
  ) {
    this.localCategories = new LocalCategoryRepository(database);
    this.localProducts = new LocalProductRepository(database);
    this.localStores = new LocalStoreRepository(database);
    this.categories = new SyncedCategoryRepository(this);
    this.products = new SyncedProductRepository(this);
    this.stores = new SyncedStoreRepository(this);
  }

  initialize() {
    return this.database.initialize();
  }
  listCategories(houseId: string) {
    return this.localCategories.list(houseId);
  }
  getCategory(houseId: string, id: string) {
    return this.localCategories.get(houseId, id);
  }
  listProducts(houseId: string) {
    return this.localProducts.list(houseId);
  }
  getProduct(houseId: string, id: string) {
    return this.localProducts.get(houseId, id);
  }
  listStores(houseId: string) {
    return this.localStores.list(houseId);
  }

  async save(type: CatalogEntityType, entity: CatalogSyncEntity) {
    const prepared = {
      ...entity,
      syncId: entity.syncId ?? (isUuid(entity.id) ? entity.id : makeUuid()),
    } as CatalogSyncEntity;
    const actorId = this.actorId ?? (await this.remote.getCurrentUserId()) ?? 'offline-session';
    const entry: CatalogSyncOutboxEntry = {
      id: outboxId(type, entity.houseId, entity.id),
      entityType: type,
      entityId: entity.id,
      houseId: entity.houseId,
      actorId,
      operation: entity.deletedAt ? 'delete' : 'upsert',
      payload: clone(prepared),
      version: prepared.updatedAt,
      createdAt: this.runtime.now().toISOString(),
      attempts: 0,
    };
    await this.putEntityAndOutbox(type, prepared, entry);
    this.emitChanged(entity.houseId);
    void this.syncNow(entity.houseId);
    return clone(prepared);
  }

  async removeStore(houseId: string, id: string) {
    const current = (await this.getRaw('store', id)) as Store | undefined;
    if (!current || current.houseId !== houseId || current.deletedAt)
      throw new Error('Este mercado não existe mais.');
    const timestamp = nextTimestamp(current.updatedAt, this.runtime.now());
    await this.save('store', { ...current, updatedAt: timestamp, deletedAt: timestamp });
  }

  async ensureDefaults(houseId: string, definitions: ReadonlyArray<DefaultCategoryDefinition>) {
    await this.localCategories.ensureDefaults(houseId, definitions);
    await this.syncNow(houseId);
    return this.listCategories(houseId);
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
          this.emitChanged(houseId);
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
    const entries = (await this.listOutbox(houseId)).filter(
      (entry) => !this.actorId || entry.actorId === this.actorId,
    );
    if (!this.runtime.isOnline()) return { state: 'offline', pending: entries.length };
    if (this.running.has(houseId)) return { state: 'syncing', pending: entries.length };
    if (entries.some((entry) => entry.lastError))
      return { state: 'error', pending: entries.length };
    return { state: entries.length ? 'pending' : 'synced', pending: entries.length };
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

  private async performSync(houseId: string) {
    if (!this.runtime.isOnline()) return;
    try {
      const actorId = await this.remote.getCurrentUserId();
      if (!actorId) return;
      await this.pull(houseId);
      const order: CatalogEntityType[] = ['category', 'product', 'store'];
      const pending = (await this.listOutbox(houseId))
        .filter((entry) => entry.actorId === actorId)
        .sort(
          (a, b) =>
            order.indexOf(a.entityType) - order.indexOf(b.entityType) ||
            a.createdAt.localeCompare(b.createdAt),
        );
      for (const entry of pending) {
        if (entry.nextAttemptAt && entry.nextAttemptAt > this.runtime.now().toISOString()) continue;
        try {
          const payload = await this.prepareRemotePayload(
            entry.entityType,
            entry.payload as CatalogSyncEntity,
          );
          const remote = await this.remote.apply(entry.entityType, payload);
          await this.mergeRemote(entry.entityType, remote);
        } catch (error) {
          await this.recordFailure(entry, error);
        }
      }
      await this.pull(houseId);
      this.emitChanged(houseId);
    } catch {
      /* dados locais continuam disponíveis; eventos futuros tentam novamente */
    }
  }

  private async pull(houseId: string) {
    const snapshot = await this.remote.list(houseId);
    for (const category of snapshot.categories) await this.mergeRemote('category', category);
    for (const product of snapshot.products) await this.mergeRemote('product', product);
    for (const store of snapshot.stores) await this.mergeRemote('store', store);
  }

  private async prepareRemotePayload(type: CatalogEntityType, entity: CatalogSyncEntity) {
    if (type !== 'product') return entity;
    const product = entity as Product;
    const category = (await this.getRaw('category', product.categoryId)) as Category | undefined;
    if (!category?.syncId) throw new Error('A categoria do produto ainda não foi sincronizada.');
    return { ...product, categoryId: category.syncId };
  }

  private async mergeRemote(type: CatalogEntityType, remote: CatalogSyncEntity) {
    let local = await this.findBySyncId(type, remote.syncId ?? remote.id);
    if (type === 'category' && !local && (remote as Category).legacyKey) {
      local = (await this.rawList('category', remote.houseId)).find(
        (item) => (item as Category).legacyKey === (remote as Category).legacyKey && !item.syncId,
      );
    }
    if (type === 'category' && !local) {
      const matches = (await this.rawList('category', remote.houseId)).filter(
        (item) =>
          !item.syncId && (item as Category).normalizedName === (remote as Category).normalizedName,
      );
      if (matches.length === 1) local = matches[0];
    }
    let localCategoryId: string | undefined;
    if (type === 'product') {
      const category = await this.findBySyncId('category', (remote as Product).categoryId);
      if (!category) return;
      localCategoryId = category.id;
      if (!local) {
        const matches = (await this.rawList('product', remote.houseId)).filter((item) => {
          const product = item as Product;
          return (
            !product.syncId &&
            product.normalizedName === (remote as Product).normalizedName &&
            normalizeCatalogName(product.brand) ===
              normalizeCatalogName((remote as Product).brand) &&
            product.categoryId === localCategoryId
          );
        });
        if (matches.length === 1) local = matches[0];
      }
    }
    if (type === 'store' && !local) {
      const normalized = (remote as Store).normalizedName ?? normalizeCatalogName(remote.name);
      const matches = (await this.rawList('store', remote.houseId)).filter(
        (item) =>
          !item.syncId &&
          ((item as Store).normalizedName ?? normalizeCatalogName(item.name)) === normalized,
      );
      if (matches.length === 1) local = matches[0];
    }
    let prepared = {
      ...remote,
      id: local?.id ?? remote.id,
      syncId: remote.syncId ?? remote.id,
    } as CatalogSyncEntity;
    if (type === 'product') {
      prepared = { ...prepared, categoryId: localCategoryId! } as Product;
    }
    const pending = await this.getOutbox(outboxId(type, remote.houseId, prepared.id));
    const ownPending =
      pending && (!this.actorId || pending.actorId === this.actorId) ? pending : undefined;
    if (ownPending && local?.syncId && wins(local, prepared)) return;
    await this.putEntity(type, prepared);
    if (ownPending && !wins(ownPending.payload as CatalogSyncEntity, prepared))
      await this.deleteOutbox(ownPending.id);
  }

  async getLegacyMigration(houseId: string): Promise<LegacyCatalogMigration | null> {
    const key = `catalog-imported:${houseId}`;
    if (await this.getMetadata(key)) return null;
    const target = await this.unsynced(houseId);
    const legacy =
      houseId === LEGACY_HOUSE_ID
        ? { categories: [], products: [], stores: [] }
        : await this.unsynced(LEGACY_HOUSE_ID);
    const categories = [...target.categories, ...legacy.categories];
    const products = [...target.products, ...legacy.products];
    const stores = [...target.stores, ...legacy.stores];
    if (!categories.length && !products.length && !stores.length) {
      await this.setMetadata({ key, value: true, completedAt: this.runtime.now().toISOString() });
      return null;
    }
    return {
      categories: categories.length,
      products: products.length,
      stores: stores.length,
      importIntoHouse: async () => {
        if (await this.getMetadata(key)) return;
        const categoryMap = new Map<string, string>();
        const existing = await this.listCategories(houseId);
        for (const source of categories) {
          const matched = source.legacyKey
            ? existing.find((item) => item.legacyKey === source.legacyKey)
            : source.houseId === houseId
              ? existing.find((item) => item.id === source.id)
              : undefined;
          const current = (await this.getRaw('category', source.id)) as Category | undefined;
          const next = matched
            ? {
                ...matched,
                syncId: matched.syncId ?? current?.syncId ?? makeUuid(),
                updatedAt: nextTimestamp(matched.updatedAt, this.runtime.now()),
              }
            : {
                ...source,
                id:
                  source.houseId === houseId
                    ? source.id
                    : await stableUuid(`local:category:${houseId}:${source.houseId}:${source.id}`),
                syncId:
                  current?.syncId ??
                  source.syncId ??
                  (await stableUuid(`remote:category:${houseId}:${source.houseId}:${source.id}`)),
                houseId,
                updatedAt: this.runtime.now().toISOString(),
                deletedAt: undefined,
              };
          categoryMap.set(source.id, next.id);
          await this.save('category', next);
        }
        for (const source of products) {
          const categoryId = categoryMap.get(source.categoryId) ?? source.categoryId;
          const current = (await this.getRaw('product', source.id)) as Product | undefined;
          await this.save('product', {
            ...source,
            id:
              source.houseId === houseId
                ? source.id
                : await stableUuid(`local:product:${houseId}:${source.houseId}:${source.id}`),
            syncId:
              current?.syncId ??
              source.syncId ??
              (await stableUuid(`remote:product:${houseId}:${source.houseId}:${source.id}`)),
            houseId,
            categoryId,
            updatedAt: this.runtime.now().toISOString(),
            deletedAt: undefined,
          });
        }
        for (const source of stores) {
          const current = (await this.getRaw('store', source.id)) as Store | undefined;
          await this.save('store', {
            ...source,
            id:
              source.houseId === houseId
                ? source.id
                : await stableUuid(`local:store:${houseId}:${source.houseId}:${source.id}`),
            syncId:
              current?.syncId ??
              source.syncId ??
              (await stableUuid(`remote:store:${houseId}:${source.houseId}:${source.id}`)),
            houseId,
            normalizedName: source.normalizedName ?? normalizeCatalogName(source.name),
            updatedAt: this.runtime.now().toISOString(),
            deletedAt: undefined,
          });
        }
        await this.setMetadata({ key, value: true, completedAt: this.runtime.now().toISOString() });
        await this.syncNow(houseId);
      },
    };
  }

  private async unsynced(houseId: string) {
    return {
      categories: ((await this.rawList('category', houseId)) as Category[]).filter(
        (item) => !item.syncId && !item.deletedAt,
      ),
      products: ((await this.rawList('product', houseId)) as Product[]).filter(
        (item) => !item.syncId && !item.deletedAt,
      ),
      stores: ((await this.rawList('store', houseId)) as Store[]).filter(
        (item) => !item.syncId && !item.deletedAt,
      ),
    };
  }
  private storeName(type: CatalogEntityType) {
    return type === 'category'
      ? CASAE_STORES.categories
      : type === 'product'
        ? CASAE_STORES.products
        : CASAE_STORES.stores;
  }
  private memoryMap(type: CatalogEntityType) {
    const memory = this.database.getMemoryDatabase();
    return (
      type === 'category' ? memory.categories : type === 'product' ? memory.products : memory.stores
    ) as Map<string, CatalogSyncEntity>;
  }
  private async rawList(type: CatalogEntityType, houseId: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native)
      return [...this.memoryMap(type).values()]
        .filter((item) => item.houseId === houseId)
        .map(clone);
    const tx = native.transaction(this.storeName(type), 'readonly');
    const values = await requestToPromise(
      tx.objectStore(this.storeName(type)).index('houseId').getAll(houseId) as IDBRequest<
        CatalogSyncEntity[]
      >,
    );
    await transactionToPromise(tx);
    return values.map(clone);
  }
  private async getRaw(type: CatalogEntityType, id: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) return clone(this.memoryMap(type).get(id));
    const tx = native.transaction(this.storeName(type), 'readonly');
    const value = await requestToPromise(
      tx.objectStore(this.storeName(type)).get(id) as IDBRequest<CatalogSyncEntity | undefined>,
    );
    await transactionToPromise(tx);
    return value && clone(value);
  }
  private async findBySyncId(type: CatalogEntityType, syncId: string) {
    const all = await this.rawList(type, '');
    if (all.length) return all.find((item) => item.syncId === syncId || item.id === syncId);
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    const values = native
      ? await (async () => {
          const tx = native.transaction(this.storeName(type), 'readonly');
          const result = await requestToPromise(
            tx.objectStore(this.storeName(type)).getAll() as IDBRequest<CatalogSyncEntity[]>,
          );
          await transactionToPromise(tx);
          return result;
        })()
      : [...this.memoryMap(type).values()];
    return values.find((item) => item.syncId === syncId || item.id === syncId);
  }
  private async putEntity(type: CatalogEntityType, entity: CatalogSyncEntity) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) this.memoryMap(type).set(entity.id, clone(entity));
    else {
      const tx = native.transaction(this.storeName(type), 'readwrite');
      tx.objectStore(this.storeName(type)).put(entity);
      await transactionToPromise(tx);
    }
  }
  private async putEntityAndOutbox(
    type: CatalogEntityType,
    entity: CatalogSyncEntity,
    entry: CatalogSyncOutboxEntry,
  ) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native) {
      this.memoryMap(type).set(entity.id, clone(entity));
      this.database.getMemoryDatabase().syncOutbox.set(entry.id, clone(entry));
    } else {
      const tx = native.transaction([this.storeName(type), CASAE_STORES.syncOutbox], 'readwrite');
      tx.objectStore(this.storeName(type)).put(entity);
      tx.objectStore(CASAE_STORES.syncOutbox).put(entry);
      await transactionToPromise(tx);
    }
  }
  private async listOutbox(houseId: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    const values = native
      ? await (async () => {
          const tx = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
          const result = await requestToPromise(
            tx.objectStore(CASAE_STORES.syncOutbox).index('houseId').getAll(houseId) as IDBRequest<
              CatalogSyncOutboxEntry[]
            >,
          );
          await transactionToPromise(tx);
          return result;
        })()
      : ([...this.database.getMemoryDatabase().syncOutbox.values()].filter(
          (item) => item.houseId === houseId,
        ) as CatalogSyncOutboxEntry[]);
    return values.filter((entry) => ['category', 'product', 'store'].includes(entry.entityType));
  }
  private async getOutbox(id: string) {
    await this.initialize();
    const native = await this.database.getNativeDatabase();
    if (!native)
      return this.database.getMemoryDatabase().syncOutbox.get(id) as
        CatalogSyncOutboxEntry | undefined;
    const tx = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
    const value = await requestToPromise(
      tx.objectStore(CASAE_STORES.syncOutbox).get(id) as IDBRequest<
        CatalogSyncOutboxEntry | undefined
      >,
    );
    await transactionToPromise(tx);
    return value;
  }
  private async deleteOutbox(id?: string) {
    if (!id) return;
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().syncOutbox.delete(id);
    else {
      const tx = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      tx.objectStore(CASAE_STORES.syncOutbox).delete(id);
      await transactionToPromise(tx);
    }
  }
  private async recordFailure(entry: CatalogSyncOutboxEntry, error: unknown) {
    const attempts = entry.attempts + 1;
    const delay = Math.min(60000, 1000 * 2 ** Math.min(attempts, 6));
    const failed = {
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
      const tx = native.transaction(CASAE_STORES.syncOutbox, 'readwrite');
      const current = await requestToPromise(
        tx.objectStore(CASAE_STORES.syncOutbox).get(entry.id) as IDBRequest<
          CatalogSyncOutboxEntry | undefined
        >,
      );
      if (current?.version !== entry.version || current.actorId !== entry.actorId) {
        await transactionToPromise(tx);
        return;
      }
      tx.objectStore(CASAE_STORES.syncOutbox).put(failed);
      await transactionToPromise(tx);
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
    const tx = native.transaction(CASAE_STORES.metadata, 'readonly');
    const value = await requestToPromise(
      tx.objectStore(CASAE_STORES.metadata).get(key) as IDBRequest<LocalMetadata | undefined>,
    );
    await transactionToPromise(tx);
    return value?.value === true;
  }
  private async setMetadata(value: LocalMetadata) {
    const native = await this.database.getNativeDatabase();
    if (!native) this.database.getMemoryDatabase().metadata.set(value.key, value);
    else {
      const tx = native.transaction(CASAE_STORES.metadata, 'readwrite');
      tx.objectStore(CASAE_STORES.metadata).put(value);
      await transactionToPromise(tx);
    }
  }
  private emitChanged(houseId: string) {
    this.listeners.get(houseId)?.forEach((listener) => listener.changed());
  }
  private async emitStatus(houseId: string) {
    const status = await this.getStatus(houseId);
    this.listeners.get(houseId)?.forEach((listener) => listener.status?.(status));
  }
}

class SyncedCategoryRepository implements CategoryRepository {
  constructor(private readonly sync: OfflineFirstCatalogSync) {}
  initialize() {
    return this.sync.initialize();
  }
  list(houseId: string) {
    return this.sync.listCategories(houseId);
  }
  get(houseId: string, id: string) {
    return this.sync.getCategory(houseId, id);
  }
  save(category: Category) {
    return this.sync.save('category', category) as Promise<Category>;
  }
  ensureDefaults(houseId: string, definitions: ReadonlyArray<DefaultCategoryDefinition>) {
    return this.sync.ensureDefaults(houseId, definitions);
  }
  subscribe(...args: Parameters<OfflineFirstCatalogSync['subscribe']>) {
    return this.sync.subscribe(...args);
  }
  syncNow(houseId: string) {
    return this.sync.syncNow(houseId);
  }
  getStatus(houseId: string) {
    return this.sync.getStatus(houseId);
  }
  getLegacyMigration(houseId: string) {
    return this.sync.getLegacyMigration(houseId);
  }
}
class SyncedProductRepository implements ProductRepository {
  constructor(private readonly sync: OfflineFirstCatalogSync) {}
  initialize() {
    return this.sync.initialize();
  }
  list(houseId: string) {
    return this.sync.listProducts(houseId);
  }
  get(houseId: string, id: string) {
    return this.sync.getProduct(houseId, id);
  }
  save(product: Product) {
    return this.sync.save('product', product) as Promise<Product>;
  }
  subscribe(...args: Parameters<OfflineFirstCatalogSync['subscribe']>) {
    return this.sync.subscribe(...args);
  }
  syncNow(houseId: string) {
    return this.sync.syncNow(houseId);
  }
  getStatus(houseId: string) {
    return this.sync.getStatus(houseId);
  }
  getLegacyMigration(houseId: string) {
    return this.sync.getLegacyMigration(houseId);
  }
}
class SyncedStoreRepository implements StoreRepository {
  constructor(private readonly sync: OfflineFirstCatalogSync) {}
  initialize() {
    return this.sync.initialize();
  }
  list(houseId: string) {
    return this.sync.listStores(houseId);
  }
  create(store: Store) {
    return this.sync.save('store', store) as Promise<Store>;
  }
  async update(houseId: string, id: string, changes: StoreUpdate) {
    const current = await this.sync
      .listStores(houseId)
      .then((items) => items.find((item) => item.id === id));
    if (!current) throw new Error('Este mercado não existe mais.');
    return this.sync.save('store', {
      ...current,
      ...changes,
      normalizedName: changes.name ? normalizeCatalogName(changes.name) : current.normalizedName,
      updatedAt: nextTimestamp(current.updatedAt, new Date()),
    }) as Promise<Store>;
  }
  async setActive(houseId: string, id: string, active: boolean) {
    return this.update(houseId, id, { active } as StoreUpdate);
  }
  remove(houseId: string, id: string) {
    return this.sync.removeStore(houseId, id);
  }
  subscribe(...args: Parameters<OfflineFirstCatalogSync['subscribe']>) {
    return this.sync.subscribe(...args);
  }
  syncNow(houseId: string) {
    return this.sync.syncNow(houseId);
  }
  getStatus(houseId: string) {
    return this.sync.getStatus(houseId);
  }
  getLegacyMigration(houseId: string) {
    return this.sync.getLegacyMigration(houseId);
  }
}

function nextTimestamp(previous: string, now: Date) {
  return new Date(Math.max(now.getTime(), new Date(previous).getTime() + 1)).toISOString();
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
