import type { StoreRepository } from '../../domain/store-repository';
import type { Store, StoreUpdate } from '../../domain/store';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

function cloneStore(store: Store): Store {
  return { ...store };
}

function sortStores(stores: Store[]) {
  return [...stores].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
}

export class LocalStoreRepository implements StoreRepository {
  readonly database: CasaeLocalDatabase;

  constructor(database: CasaeLocalDatabase | string = new CasaeLocalDatabase()) {
    this.database =
      typeof database === 'string'
        ? new CasaeLocalDatabase(database, { migrateLegacy: false })
        : database;
  }

  initialize() {
    return this.database.initialize();
  }

  async list(houseId: string): Promise<Store[]> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      return sortStores(
        [...this.database.getMemoryDatabase().stores.values()]
          .filter((store) => store.houseId === houseId && !store.deletedAt)
          .map(cloneStore),
      );
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.stores, 'readonly');
    const stores = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.stores)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<Store[]>,
    );
    await transactionToPromise(transaction);
    return sortStores(stores.filter((store) => !store.deletedAt).map(cloneStore));
  }

  async create(store: Store): Promise<Store> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      this.database.getMemoryDatabase().stores.set(store.id, cloneStore(store));
      return cloneStore(store);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.stores, 'readwrite');
    transaction.objectStore(CASAE_STORES.stores).add(store);
    await transactionToPromise(transaction);
    return cloneStore(store);
  }

  async update(houseId: string, id: string, changes: StoreUpdate): Promise<Store> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const stores = this.database.getMemoryDatabase().stores;
      const current = stores.get(id);
      if (!current || current.houseId !== houseId) throw new Error('Este mercado não existe mais.');
      const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
      stores.set(id, updated);
      return cloneStore(updated);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.stores, 'readwrite');
    const objectStore = transaction.objectStore(CASAE_STORES.stores);
    const current = await requestToPromise(objectStore.get(id) as IDBRequest<Store | undefined>);
    if (!current || current.houseId !== houseId) {
      transaction.abort();
      throw new Error('Este mercado não existe mais.');
    }
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
    objectStore.put(updated);
    await transactionToPromise(transaction);
    return cloneStore(updated);
  }

  async setActive(houseId: string, id: string, active: boolean): Promise<Store> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const stores = this.database.getMemoryDatabase().stores;
      const current = stores.get(id);
      if (!current || current.houseId !== houseId) throw new Error('Este mercado não existe mais.');
      const updated = { ...current, active, updatedAt: new Date().toISOString() };
      stores.set(id, updated);
      return cloneStore(updated);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.stores, 'readwrite');
    const objectStore = transaction.objectStore(CASAE_STORES.stores);
    const current = await requestToPromise(objectStore.get(id) as IDBRequest<Store | undefined>);
    if (!current || current.houseId !== houseId) {
      transaction.abort();
      throw new Error('Este mercado não existe mais.');
    }
    const updated = { ...current, active, updatedAt: new Date().toISOString() };
    objectStore.put(updated);
    await transactionToPromise(transaction);
    return cloneStore(updated);
  }

  async remove(houseId: string, id: string): Promise<void> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const store = this.database.getMemoryDatabase().stores.get(id);
      if (!store || store.houseId !== houseId) throw new Error('Este mercado não existe mais.');
      this.database.getMemoryDatabase().stores.delete(id);
      return;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.stores, 'readwrite');
    const store = transaction.objectStore(CASAE_STORES.stores);
    const current = await requestToPromise(store.get(id) as IDBRequest<Store | undefined>);
    if (!current || current.houseId !== houseId) {
      transaction.abort();
      throw new Error('Este mercado não existe mais.');
    }
    store.delete(id);
    await transactionToPromise(transaction);
  }
}
