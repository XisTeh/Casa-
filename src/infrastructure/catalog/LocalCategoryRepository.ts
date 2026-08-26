import type { Category } from '../../domain/catalog';
import type { CategoryRepository } from '../../domain/category-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

const clone = (category: Category): Category => ({ ...category });

export class LocalCategoryRepository implements CategoryRepository {
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

  async list(houseId: string) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      return [...this.database.getMemoryDatabase().categories.values()]
        .filter((category) => category.houseId === houseId)
        .map(clone)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.categories, 'readonly');
    const categories = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.categories)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<Category[]>,
    );
    await transactionToPromise(transaction);
    return categories.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async get(houseId: string, id: string) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const category = this.database.getMemoryDatabase().categories.get(id);
      return category?.houseId === houseId ? clone(category) : undefined;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.categories, 'readonly');
    const category = await requestToPromise(
      transaction.objectStore(CASAE_STORES.categories).get(id) as IDBRequest<Category | undefined>,
    );
    await transactionToPromise(transaction);
    return category?.houseId === houseId ? clone(category) : undefined;
  }

  async save(category: Category) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      this.database.getMemoryDatabase().categories.set(category.id, clone(category));
      return clone(category);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.categories, 'readwrite');
    transaction.objectStore(CASAE_STORES.categories).put(category);
    await transactionToPromise(transaction);
    return clone(category);
  }
}
