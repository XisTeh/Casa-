import type { ShoppingListItem, ShoppingListItemUpdate } from '../../domain/shopping-list';
import type { ShoppingListRepository } from '../../domain/shopping-list-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

function cloneItem(item: ShoppingListItem): ShoppingListItem {
  return { ...item };
}

function sortItems(items: ShoppingListItem[]) {
  return [...items].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

export class LocalShoppingRepository implements ShoppingListRepository {
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

  async list(houseId: string): Promise<ShoppingListItem[]> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      return sortItems(
        [...this.database.getMemoryDatabase().shoppingItems.values()]
          .filter((item) => item.houseId === houseId && !item.deletedAt)
          .map(cloneItem),
      );
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.shoppingItems, 'readonly');
    const items = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.shoppingItems)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<ShoppingListItem[]>,
    );
    await transactionToPromise(transaction);
    return sortItems(items.filter((item) => !item.deletedAt).map(cloneItem));
  }

  async create(item: ShoppingListItem): Promise<ShoppingListItem> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      this.database.getMemoryDatabase().shoppingItems.set(item.id, cloneItem(item));
      return cloneItem(item);
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.shoppingItems, 'readwrite');
    transaction.objectStore(CASAE_STORES.shoppingItems).put(item);
    await transactionToPromise(transaction);
    return cloneItem(item);
  }

  async update(
    houseId: string,
    id: string,
    changes: ShoppingListItemUpdate,
  ): Promise<ShoppingListItem> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      const items = this.database.getMemoryDatabase().shoppingItems;
      const current = items.get(id);
      if (!current || current.houseId !== houseId)
        throw new Error('Este item não existe mais na lista.');
      const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
      items.set(id, updated);
      return cloneItem(updated);
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.shoppingItems, 'readwrite');
    const store = transaction.objectStore(CASAE_STORES.shoppingItems);
    const current = await requestToPromise(
      store.get(id) as IDBRequest<ShoppingListItem | undefined>,
    );
    if (!current || current.houseId !== houseId) {
      transaction.abort();
      throw new Error('Este item não existe mais na lista.');
    }
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
    store.put(updated);
    await transactionToPromise(transaction);
    return cloneItem(updated);
  }

  async remove(houseId: string, id: string): Promise<void> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      const item = this.database.getMemoryDatabase().shoppingItems.get(id);
      if (!item || item.houseId !== houseId) throw new Error('Este item não existe mais na lista.');
      this.database.getMemoryDatabase().shoppingItems.delete(id);
      return;
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.shoppingItems, 'readwrite');
    const store = transaction.objectStore(CASAE_STORES.shoppingItems);
    const item = await requestToPromise(store.get(id) as IDBRequest<ShoppingListItem | undefined>);
    if (!item || item.houseId !== houseId) {
      transaction.abort();
      throw new Error('Este item não existe mais na lista.');
    }
    store.delete(id);
    await transactionToPromise(transaction);
  }
}
