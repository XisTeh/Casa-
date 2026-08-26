import type { Product } from '../../domain/catalog';
import type { ProductRepository } from '../../domain/product-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

const clone = (product: Product): Product => ({ ...product });

export class LocalProductRepository implements ProductRepository {
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
      return [...this.database.getMemoryDatabase().products.values()]
        .filter((product) => product.houseId === houseId)
        .map(clone)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.products, 'readonly');
    const products = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.products)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<Product[]>,
    );
    await transactionToPromise(transaction);
    return products.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async get(houseId: string, id: string) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const product = this.database.getMemoryDatabase().products.get(id);
      return product?.houseId === houseId ? clone(product) : undefined;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.products, 'readonly');
    const product = await requestToPromise(
      transaction.objectStore(CASAE_STORES.products).get(id) as IDBRequest<Product | undefined>,
    );
    await transactionToPromise(transaction);
    return product?.houseId === houseId ? clone(product) : undefined;
  }

  async save(product: Product) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      this.database.getMemoryDatabase().products.set(product.id, clone(product));
      return clone(product);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.products, 'readwrite');
    transaction.objectStore(CASAE_STORES.products).put(product);
    await transactionToPromise(transaction);
    return clone(product);
  }
}
