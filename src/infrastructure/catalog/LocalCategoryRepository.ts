import {
  normalizeCatalogName,
  type Category,
  type DefaultCategoryDefinition,
} from '../../domain/catalog';
import type { CategoryRepository } from '../../domain/category-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

const clone = (category: Category): Category => ({ ...category });

function categoryForDefinition(
  houseId: string,
  definition: DefaultCategoryDefinition,
  now: string,
): Category {
  return {
    id: `category-${houseId}-${definition.legacyKey}`,
    houseId,
    name: definition.name,
    normalizedName: normalizeCatalogName(definition.name),
    legacyKey: definition.legacyKey,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function missingDefaults(
  houseId: string,
  existing: Category[],
  definitions: ReadonlyArray<DefaultCategoryDefinition>,
) {
  const now = new Date().toISOString();
  const additions: Category[] = [];
  const metadataUpdates: Category[] = [];
  for (const definition of definitions) {
    if (existing.some((category) => category.legacyKey === definition.legacyKey)) continue;
    const sameName = existing.find(
      (category) => category.normalizedName === normalizeCatalogName(definition.name),
    );
    if (sameName) {
      const updated = { ...sameName, legacyKey: definition.legacyKey, updatedAt: now };
      metadataUpdates.push(updated);
      existing.splice(existing.indexOf(sameName), 1, updated);
      continue;
    }
    const category = categoryForDefinition(houseId, definition, now);
    additions.push(category);
    existing.push(category);
  }
  return [...metadataUpdates, ...additions];
}

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
        .filter((category) => category.houseId === houseId && !category.deletedAt)
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
    return categories
      .filter((category) => !category.deletedAt)
      .map(clone)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async get(houseId: string, id: string) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const category = this.database.getMemoryDatabase().categories.get(id);
      return category?.houseId === houseId && !category.deletedAt ? clone(category) : undefined;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.categories, 'readonly');
    const category = await requestToPromise(
      transaction.objectStore(CASAE_STORES.categories).get(id) as IDBRequest<Category | undefined>,
    );
    await transactionToPromise(transaction);
    return category?.houseId === houseId && !category.deletedAt ? clone(category) : undefined;
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

  async ensureDefaults(houseId: string, definitions: ReadonlyArray<DefaultCategoryDefinition>) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const memory = this.database.getMemoryDatabase();
      const existing = [...memory.categories.values()].filter(
        (category) => category.houseId === houseId,
      );
      for (const category of missingDefaults(houseId, existing, definitions)) {
        memory.categories.set(category.id, clone(category));
      }
      return this.list(houseId);
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.categories, 'readwrite');
    const completed = transactionToPromise(transaction);
    const store = transaction.objectStore(CASAE_STORES.categories);
    const existing = await requestToPromise(
      store.index('houseId').getAll(IDBKeyRange.only(houseId)) as IDBRequest<Category[]>,
    );
    for (const category of missingDefaults(houseId, existing, definitions)) store.put(category);
    await completed;
    return existing.map(clone).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
