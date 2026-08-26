import type { PersistedPurchaseSession, PurchaseItem } from '../../domain/purchase';
import {
  DEFAULT_CATEGORY_DEFINITIONS,
  normalizeCatalogName,
  type Category,
  type Product,
} from '../../domain/catalog';
import type { AvatarCrop } from '../../domain/profile-avatar';
import type { CatalogSyncOutboxEntry } from '../../domain/catalog-sync';
import {
  HOUSE_ID,
  initialShoppingListSeed,
  type ShoppingListItem,
  type ShoppingSyncOutboxEntry,
} from '../../domain/shopping-list';
import type { Store } from '../../domain/store';
import type { HouseBudget } from '../../domain/budget';
import {
  LEGACY_HOUSE_ID,
  LEGACY_HOUSE_NAME,
  LEGACY_MEMBER_ID,
  LEGACY_MEMBER_NAME,
  type House,
  type HouseMember,
} from '../../domain/house';

export const CASAE_DATABASE_NAME = 'casae-local';
export const CASAE_DATABASE_VERSION = 8;

export const ACTIVE_HOUSE_METADATA_KEY = 'activeHouseId';
export const ACTIVE_MEMBER_METADATA_KEY = 'activeMemberId';

export const CASAE_STORES = {
  shoppingItems: 'shoppingItems',
  purchaseSessions: 'purchaseSessions',
  purchaseItems: 'purchaseItems',
  stores: 'stores',
  products: 'products',
  categories: 'categories',
  houseBudgets: 'houseBudgets',
  houses: 'houses',
  houseMembers: 'houseMembers',
  profileAvatars: 'profileAvatars',
  metadata: 'metadata',
  syncOutbox: 'syncOutbox',
} as const;

const LEGACY_SHOPPING_DATABASE = 'casae-shopping-list';
const LEGACY_PURCHASE_DATABASE = 'casae-purchases';
const LEGACY_SHOPPING_ITEMS_STORE = 'shopping-items';
const LEGACY_SHOPPING_METADATA_STORE = 'metadata';
const LEGACY_PURCHASE_SESSIONS_STORE = 'purchase-sessions';
const LEGACY_PURCHASE_ITEMS_STORE = 'purchase-items';
const LEGACY_SEED_KEY = 'shopping-list-seed-v1';
const MIGRATION_KEY = 'legacy-databases-to-casae-local-v1';
const SEED_KEY = 'shopping-list-seed-v1';
export const CATALOG_MIGRATION_KEY = 'catalog-products-categories-v2';
export const RECURRENCE_MIGRATION_KEY = 'product-recurrence-v5';

export type LocalMetadata = {
  key: string;
  value: boolean | string;
  completedAt?: string;
};

export type LocalProfileAvatar = {
  profileId: string;
  avatarBlob: Blob;
  avatarSourceBlob?: Blob;
  avatarCrop?: AvatarCrop;
  updatedAt: string;
};

export type CasaeMemoryDatabase = {
  shoppingItems: Map<string, ShoppingListItem>;
  purchaseSessions: Map<string, PersistedPurchaseSession>;
  purchaseItems: Map<string, PurchaseItem>;
  stores: Map<string, Store>;
  products: Map<string, Product>;
  categories: Map<string, Category>;
  houseBudgets: Map<string, HouseBudget>;
  houses: Map<string, House>;
  houseMembers: Map<string, HouseMember>;
  profileAvatars: Map<string, LocalProfileAvatar>;
  metadata: Map<string, LocalMetadata>;
  syncOutbox: Map<string, ShoppingSyncOutboxEntry | CatalogSyncOutboxEntry>;
};

export type LegacyDatabaseSnapshot = {
  shoppingDatabaseFound: boolean;
  shoppingSeeded: boolean;
  shoppingItems: ShoppingListItem[];
  purchaseDatabaseFound: boolean;
  purchaseSessions: PersistedPurchaseSession[];
  purchaseItems: PurchaseItem[];
};

type CasaeLocalDatabaseOptions = {
  migrateLegacy?: boolean;
  legacyReader?: () => Promise<LegacyDatabaseSnapshot>;
};

const memoryDatabases = new Map<string, CasaeMemoryDatabase>();

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Não foi possível acessar os dados locais.'));
  });
}

export function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('A operação local foi interrompida.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('A operação local falhou.'));
  });
}

function createMemoryDatabase(): CasaeMemoryDatabase {
  const now = new Date().toISOString();
  const house: House = {
    id: LEGACY_HOUSE_ID,
    name: LEGACY_HOUSE_NAME,
    createdAt: now,
    updatedAt: now,
    createdByMemberId: LEGACY_MEMBER_ID,
    isActive: true,
  };
  const member: HouseMember = {
    id: LEGACY_MEMBER_ID,
    houseId: LEGACY_HOUSE_ID,
    displayName: LEGACY_MEMBER_NAME,
    avatarSeed: LEGACY_MEMBER_NAME,
    role: 'owner',
    status: 'active',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return {
    shoppingItems: new Map(),
    purchaseSessions: new Map(),
    purchaseItems: new Map(),
    stores: new Map(),
    products: new Map(),
    categories: new Map(),
    houseBudgets: new Map(),
    houses: new Map([[house.id, house]]),
    houseMembers: new Map([[member.id, member]]),
    profileAvatars: new Map(),
    metadata: new Map([
      [ACTIVE_HOUSE_METADATA_KEY, { key: ACTIVE_HOUSE_METADATA_KEY, value: house.id }],
      [ACTIVE_MEMBER_METADATA_KEY, { key: ACTIVE_MEMBER_METADATA_KEY, value: member.id }],
    ]),
    syncOutbox: new Map(),
  };
}

function openCasaeDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, CASAE_DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(CASAE_STORES.shoppingItems)) {
        const store = database.createObjectStore(CASAE_STORES.shoppingItems, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.purchaseSessions)) {
        const store = database.createObjectStore(CASAE_STORES.purchaseSessions, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.purchaseItems)) {
        const store = database.createObjectStore(CASAE_STORES.purchaseItems, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
        store.createIndex('purchaseSessionId', 'purchaseSessionId', { unique: false });
        store.createIndex('productId', 'productId', { unique: false });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.stores)) {
        const store = database.createObjectStore(CASAE_STORES.stores, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.products)) {
        const store = database.createObjectStore(CASAE_STORES.products, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
        store.createIndex('houseAndNormalizedName', ['houseId', 'normalizedName'], {
          unique: false,
        });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.categories)) {
        const store = database.createObjectStore(CASAE_STORES.categories, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
        store.createIndex('houseAndNormalizedName', ['houseId', 'normalizedName'], {
          unique: true,
        });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.houseBudgets)) {
        const store = database.createObjectStore(CASAE_STORES.houseBudgets, { keyPath: 'id' });
        store.createIndex('houseId', 'houseId', { unique: false });
        store.createIndex('houseYearMonth', ['houseId', 'year', 'month'], { unique: true });
      }

      let housesStore: IDBObjectStore | undefined;
      if (!database.objectStoreNames.contains(CASAE_STORES.houses)) {
        housesStore = database.createObjectStore(CASAE_STORES.houses, { keyPath: 'id' });
        housesStore.createIndex('isActive', 'isActive', { unique: false });
      }

      let membersStore: IDBObjectStore | undefined;
      if (!database.objectStoreNames.contains(CASAE_STORES.houseMembers)) {
        membersStore = database.createObjectStore(CASAE_STORES.houseMembers, { keyPath: 'id' });
        membersStore.createIndex('houseId', 'houseId', { unique: false });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.profileAvatars)) {
        database.createObjectStore(CASAE_STORES.profileAvatars, { keyPath: 'profileId' });
      }

      if (!database.objectStoreNames.contains(CASAE_STORES.metadata)) {
        database.createObjectStore(CASAE_STORES.metadata, { keyPath: 'key' });
      }

      const syncStore = database.objectStoreNames.contains(CASAE_STORES.syncOutbox)
        ? request.transaction!.objectStore(CASAE_STORES.syncOutbox)
        : database.createObjectStore(CASAE_STORES.syncOutbox, { keyPath: 'id' });
      if (!syncStore.indexNames.contains('houseId')) {
        syncStore.createIndex('houseId', 'houseId', { unique: false });
      }
      if (syncStore.indexNames.contains('houseAndEntity')) syncStore.deleteIndex('houseAndEntity');
      if (!syncStore.indexNames.contains('houseEntityTypeAndId')) {
        syncStore.createIndex('houseEntityTypeAndId', ['houseId', 'entityType', 'entityId'], {
          unique: true,
        });
      }

      if (housesStore && membersStore) {
        const now = new Date().toISOString();
        housesStore.put({
          id: LEGACY_HOUSE_ID,
          name: LEGACY_HOUSE_NAME,
          createdAt: now,
          updatedAt: now,
          createdByMemberId: LEGACY_MEMBER_ID,
          isActive: true,
        } satisfies House);
        membersStore.put({
          id: LEGACY_MEMBER_ID,
          houseId: LEGACY_HOUSE_ID,
          displayName: LEGACY_MEMBER_NAME,
          avatarSeed: LEGACY_MEMBER_NAME,
          role: 'owner',
          status: 'active',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        } satisfies HouseMember);
        const metadataStore = request.transaction!.objectStore(CASAE_STORES.metadata);
        metadataStore.put({ key: ACTIVE_HOUSE_METADATA_KEY, value: LEGACY_HOUSE_ID });
        metadataStore.put({ key: ACTIVE_MEMBER_METADATA_KEY, value: LEGACY_MEMBER_ID });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Não foi possível abrir o banco local do Casaê.'));
  });
}

async function databaseExists(name: string) {
  if ('databases' in indexedDB && typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    return databases.some((database) => database.name === name);
  }

  return true;
}

async function openLegacyDatabase(name: string): Promise<IDBDatabase | null> {
  if (!(await databaseExists(name))) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let createdDuringCheck = false;

    request.onupgradeneeded = () => {
      createdDuringCheck = true;
    };
    request.onsuccess = () => {
      if (createdDuringCheck) {
        request.result.close();
        indexedDB.deleteDatabase(name);
        resolve(null);
        return;
      }

      resolve(request.result);
    };
    request.onerror = () =>
      reject(request.error ?? new Error(`Não foi possível ler o banco legado ${name}.`));
  });
}

async function readLegacyShoppingDatabase() {
  const database = await openLegacyDatabase(LEGACY_SHOPPING_DATABASE);

  if (!database || !database.objectStoreNames.contains(LEGACY_SHOPPING_ITEMS_STORE)) {
    database?.close();
    return { found: false, seeded: false, items: [] as ShoppingListItem[] };
  }

  const storeNames = [LEGACY_SHOPPING_ITEMS_STORE];
  if (database.objectStoreNames.contains(LEGACY_SHOPPING_METADATA_STORE)) {
    storeNames.push(LEGACY_SHOPPING_METADATA_STORE);
  }
  const transaction = database.transaction(storeNames, 'readonly');
  const items = await requestToPromise(
    transaction.objectStore(LEGACY_SHOPPING_ITEMS_STORE).getAll() as IDBRequest<ShoppingListItem[]>,
  );
  let seeded = false;

  if (storeNames.includes(LEGACY_SHOPPING_METADATA_STORE)) {
    const metadata = await requestToPromise(
      transaction.objectStore(LEGACY_SHOPPING_METADATA_STORE).get(LEGACY_SEED_KEY) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    seeded = metadata?.value === true;
  }

  await transactionToPromise(transaction);
  database.close();
  return { found: true, seeded, items };
}

async function readLegacyPurchaseDatabase() {
  const database = await openLegacyDatabase(LEGACY_PURCHASE_DATABASE);

  if (!database || !database.objectStoreNames.contains(LEGACY_PURCHASE_SESSIONS_STORE)) {
    database?.close();
    return {
      found: false,
      sessions: [] as PersistedPurchaseSession[],
      items: [] as PurchaseItem[],
    };
  }

  const storeNames = [LEGACY_PURCHASE_SESSIONS_STORE];
  if (database.objectStoreNames.contains(LEGACY_PURCHASE_ITEMS_STORE)) {
    storeNames.push(LEGACY_PURCHASE_ITEMS_STORE);
  }
  const transaction = database.transaction(storeNames, 'readonly');
  const sessions = await requestToPromise(
    transaction.objectStore(LEGACY_PURCHASE_SESSIONS_STORE).getAll() as IDBRequest<
      PersistedPurchaseSession[]
    >,
  );
  const items = storeNames.includes(LEGACY_PURCHASE_ITEMS_STORE)
    ? await requestToPromise(
        transaction.objectStore(LEGACY_PURCHASE_ITEMS_STORE).getAll() as IDBRequest<PurchaseItem[]>,
      )
    : [];
  await transactionToPromise(transaction);
  database.close();
  return { found: true, sessions, items };
}

async function readLegacyDatabases(): Promise<LegacyDatabaseSnapshot> {
  const [shopping, purchases] = await Promise.all([
    readLegacyShoppingDatabase(),
    readLegacyPurchaseDatabase(),
  ]);

  return {
    shoppingDatabaseFound: shopping.found,
    shoppingSeeded: shopping.seeded,
    shoppingItems: shopping.items,
    purchaseDatabaseFound: purchases.found,
    purchaseSessions: purchases.sessions,
    purchaseItems: purchases.items,
  };
}

function normalizeStoreName(name: string) {
  return name.trim().toLocaleLowerCase('pt-BR');
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function prepareLegacyData(snapshot: LegacyDatabaseSnapshot) {
  const now = new Date().toISOString();
  const storesByKey = new Map<string, Store>();
  const sessions = snapshot.purchaseSessions.map((session) => {
    const houseId = session.houseId || HOUSE_ID;
    const storeKey = `${houseId}:${normalizeStoreName(session.storeNameSnapshot)}`;
    const storeId = session.storeId ?? `migrated-store-${stableHash(storeKey)}`;

    if (!storesByKey.has(storeKey)) {
      storesByKey.set(storeKey, {
        id: storeId,
        houseId,
        name: session.storeNameSnapshot,
        nickname: '',
        address: '',
        notes: 'Cadastro recuperado dos dados locais anteriores.',
        active: true,
        createdAt: session.startedAt || now,
        updatedAt: now,
      });
    }

    return { ...session, houseId, storeId };
  });
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const items = snapshot.purchaseItems.map((item) => {
    const session = sessionsById.get(item.purchaseSessionId);
    return {
      ...item,
      houseId: item.houseId || session?.houseId || HOUSE_ID,
      storeId: item.storeId ?? session?.storeId,
      origin: item.origin ?? (item.sourceShoppingItemId ? 'shopping-list' : 'manual'),
    };
  });

  return { sessions, items, stores: [...storesByKey.values()] };
}

function categoryIdForLegacy(houseId: string, legacyKey: string) {
  return `category-${stableHash(houseId)}-${legacyKey}`;
}

export function prepareCatalogData(
  shoppingItems: ShoppingListItem[],
  purchaseItems: PurchaseItem[],
  existingProducts: Product[] = [],
  existingCategories: Category[] = [],
) {
  const now = new Date().toISOString();
  const houses = new Set([
    HOUSE_ID,
    ...shoppingItems.map((item) => item.houseId || HOUSE_ID),
    ...purchaseItems.map((item) => item.houseId || HOUSE_ID),
  ]);
  const categories = new Map(existingCategories.map((category) => [category.id, { ...category }]));

  for (const houseId of houses) {
    for (const definition of DEFAULT_CATEGORY_DEFINITIONS) {
      const alreadyExists = [...categories.values()].some(
        (category) => category.houseId === houseId && category.legacyKey === definition.legacyKey,
      );
      if (alreadyExists) continue;
      const id = categoryIdForLegacy(houseId, definition.legacyKey);
      categories.set(id, {
        id,
        houseId,
        name: definition.name,
        normalizedName: normalizeCatalogName(definition.name),
        legacyKey: definition.legacyKey,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const categoryFor = (houseId: string, legacyKey?: string) =>
    [...categories.values()].find(
      (category) => category.houseId === houseId && category.legacyKey === legacyKey,
    ) ??
    [...categories.values()].find(
      (category) => category.houseId === houseId && category.legacyKey === 'outros',
    )!;
  const products = new Map(existingProducts.map((product) => [product.id, { ...product }]));
  const preexistingIds = new Set(existingProducts.map((product) => product.id));

  const findExactProduct = (houseId: string, normalizedName: string) => {
    const matches = [...products.values()].filter(
      (product) => product.houseId === houseId && product.normalizedName === normalizedName,
    );
    return matches.length === 1 ? matches[0] : undefined;
  };

  const resolveProduct = (source: {
    productId?: string;
    houseId: string;
    name: string;
    brand?: string;
    category?: string;
    quantity?: number;
    unit: Product['defaultUnit'];
    notes?: string;
    occurredAt?: string;
    preferAsCurrent?: boolean;
  }) => {
    const normalizedName = normalizeCatalogName(source.name);
    const exactProduct = source.productId
      ? products.get(source.productId)
      : findExactProduct(source.houseId, normalizedName);
    const id =
      exactProduct?.id ??
      source.productId ??
      `product-${stableHash(`${source.houseId}:${normalizedName}`)}`;
    const current = products.get(id);
    const category = categoryFor(source.houseId, source.category);
    const shouldRefresh = source.preferAsCurrent && !preexistingIds.has(id);

    if (!current) {
      products.set(id, {
        id,
        houseId: source.houseId,
        name: source.name.trim(),
        normalizedName,
        brand: source.brand?.trim() ?? '',
        categoryId: category.id,
        defaultQuantity: source.quantity,
        defaultUnit: source.unit,
        notes: source.notes?.trim() ?? '',
        favorite: false,
        active: true,
        createdAt: source.occurredAt ?? now,
        updatedAt: now,
      });
    } else if (shouldRefresh) {
      products.set(id, {
        ...current,
        name: source.name.trim(),
        normalizedName,
        brand: source.brand?.trim() ?? current.brand,
        categoryId: category.id,
        defaultQuantity: source.quantity ?? current.defaultQuantity,
        defaultUnit: source.unit,
        notes: source.notes?.trim() ?? current.notes,
        updatedAt: now,
      });
    }

    return { productId: id, categoryId: category.id };
  };

  const reconciledPurchaseItems = purchaseItems.map((item) => {
    const houseId = item.houseId || HOUSE_ID;
    const resolved = resolveProduct({
      productId: item.productId,
      houseId,
      name: item.productNameSnapshot,
      brand: item.brandSnapshot,
      category: item.categorySnapshot,
      quantity: item.plannedQuantity,
      unit: item.unitSnapshot,
      notes: item.notesSnapshot,
      occurredAt: item.purchasedAt,
    });
    return { ...item, houseId, productId: resolved.productId };
  });

  const reconciledShoppingItems = shoppingItems.map((item) => {
    const houseId = item.houseId || HOUSE_ID;
    const resolved = resolveProduct({
      productId: item.productId ?? item.houseProductId,
      houseId,
      name: item.productName,
      brand: item.preferredBrand,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
      occurredAt: item.createdAt,
      preferAsCurrent: true,
    });
    return {
      ...item,
      houseId,
      productId: resolved.productId,
      categoryId: resolved.categoryId,
      categoryName: categoryFor(houseId, item.category).name,
    };
  });

  return {
    categories: [...categories.values()],
    products: [...products.values()],
    shoppingItems: reconciledShoppingItems,
    purchaseItems: reconciledPurchaseItems,
  };
}

export class CasaeLocalDatabase {
  private databasePromise?: Promise<IDBDatabase>;
  private initializationPromise?: Promise<void>;
  private readonly memoryDatabase: CasaeMemoryDatabase;
  private readonly migrateLegacy: boolean;
  private readonly legacyReader: () => Promise<LegacyDatabaseSnapshot>;
  private readonly readLegacyInMemory: boolean;

  constructor(
    readonly name = CASAE_DATABASE_NAME,
    options: CasaeLocalDatabaseOptions = {},
  ) {
    this.migrateLegacy = options.migrateLegacy ?? name === CASAE_DATABASE_NAME;
    this.legacyReader = options.legacyReader ?? readLegacyDatabases;
    this.readLegacyInMemory = options.legacyReader !== undefined;
    let memoryDatabase = memoryDatabases.get(name);

    if (!memoryDatabase) {
      memoryDatabase = createMemoryDatabase();
      memoryDatabases.set(name, memoryDatabase);
    }

    this.memoryDatabase = memoryDatabase;
  }

  async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce();
    }
    return this.initializationPromise;
  }

  hasIndexedDb() {
    return typeof indexedDB !== 'undefined';
  }

  getMemoryDatabase() {
    return this.memoryDatabase;
  }

  async getNativeDatabase() {
    if (!this.hasIndexedDb()) {
      return null;
    }
    if (!this.databasePromise) {
      this.databasePromise = openCasaeDatabase(this.name);
    }
    return this.databasePromise;
  }

  private async initializeOnce() {
    const database = await this.getNativeDatabase();

    if (!database) {
      await this.initializeMemoryDatabase();
      return;
    }

    const checkTransaction = database.transaction(CASAE_STORES.metadata, 'readonly');
    const migration = await requestToPromise(
      checkTransaction.objectStore(CASAE_STORES.metadata).get(MIGRATION_KEY) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    await transactionToPromise(checkTransaction);

    if (!migration?.value) {
      const snapshot = this.migrateLegacy
        ? await this.legacyReader()
        : {
            shoppingDatabaseFound: false,
            shoppingSeeded: false,
            shoppingItems: [],
            purchaseDatabaseFound: false,
            purchaseSessions: [],
            purchaseItems: [],
          };
      const prepared = prepareLegacyData(snapshot);
      const transaction = database.transaction(Object.values(CASAE_STORES), 'readwrite');
      const shoppingStore = transaction.objectStore(CASAE_STORES.shoppingItems);
      const existingShoppingItems = await requestToPromise(
        shoppingStore.count() as IDBRequest<number>,
      );

      snapshot.shoppingItems.forEach((item) => shoppingStore.put(item));
      prepared.sessions.forEach((session) =>
        transaction.objectStore(CASAE_STORES.purchaseSessions).put(session),
      );
      prepared.items.forEach((item) =>
        transaction.objectStore(CASAE_STORES.purchaseItems).put(item),
      );
      prepared.stores.forEach((store) => transaction.objectStore(CASAE_STORES.stores).put(store));

      const shouldSeed =
        existingShoppingItems === 0 &&
        !snapshot.shoppingDatabaseFound &&
        snapshot.shoppingItems.length === 0;
      if (shouldSeed) {
        initialShoppingListSeed.forEach((item) => shoppingStore.put(item));
      }

      const metadataStore = transaction.objectStore(CASAE_STORES.metadata);
      metadataStore.put({ key: SEED_KEY, value: shouldSeed || snapshot.shoppingSeeded });
      metadataStore.put({ key: MIGRATION_KEY, value: true, completedAt: new Date().toISOString() });
      await transactionToPromise(transaction);
    }

    await this.migrateCatalogDatabase(database);
    await this.migrateProductRecurrence(database);
  }

  private async migrateProductRecurrence(database: IDBDatabase) {
    const check = database.transaction(CASAE_STORES.metadata, 'readonly');
    const completed = await requestToPromise(
      check.objectStore(CASAE_STORES.metadata).get(RECURRENCE_MIGRATION_KEY) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    await transactionToPromise(check);
    if (completed?.value) return;

    const transaction = database.transaction(
      [CASAE_STORES.products, CASAE_STORES.metadata],
      'readwrite',
    );
    const productStore = transaction.objectStore(CASAE_STORES.products);
    const products = await requestToPromise(productStore.getAll() as IDBRequest<Product[]>);
    products.forEach((product) =>
      productStore.put({
        ...product,
        isRecurring: product.isRecurring === true,
        recurrenceDays:
          product.isRecurring === true &&
          Number.isInteger(product.recurrenceDays) &&
          product.recurrenceDays! >= 1 &&
          product.recurrenceDays! <= 365
            ? product.recurrenceDays
            : undefined,
      }),
    );
    transaction.objectStore(CASAE_STORES.metadata).put({
      key: RECURRENCE_MIGRATION_KEY,
      value: true,
      completedAt: new Date().toISOString(),
    });
    await transactionToPromise(transaction);
  }

  private async migrateCatalogDatabase(database: IDBDatabase) {
    const check = database.transaction(CASAE_STORES.metadata, 'readonly');
    const completed = await requestToPromise(
      check.objectStore(CASAE_STORES.metadata).get(CATALOG_MIGRATION_KEY) as IDBRequest<
        LocalMetadata | undefined
      >,
    );
    await transactionToPromise(check);
    if (completed?.value) return;

    const transaction = database.transaction(
      [
        CASAE_STORES.shoppingItems,
        CASAE_STORES.purchaseItems,
        CASAE_STORES.products,
        CASAE_STORES.categories,
        CASAE_STORES.metadata,
      ],
      'readwrite',
    );
    const [shoppingItems, purchaseItems, products, categories] = await Promise.all([
      requestToPromise(
        transaction.objectStore(CASAE_STORES.shoppingItems).getAll() as IDBRequest<
          ShoppingListItem[]
        >,
      ),
      requestToPromise(
        transaction.objectStore(CASAE_STORES.purchaseItems).getAll() as IDBRequest<PurchaseItem[]>,
      ),
      requestToPromise(
        transaction.objectStore(CASAE_STORES.products).getAll() as IDBRequest<Product[]>,
      ),
      requestToPromise(
        transaction.objectStore(CASAE_STORES.categories).getAll() as IDBRequest<Category[]>,
      ),
    ]);
    const catalog = prepareCatalogData(shoppingItems, purchaseItems, products, categories);
    catalog.shoppingItems.forEach((item) =>
      transaction.objectStore(CASAE_STORES.shoppingItems).put(item),
    );
    catalog.purchaseItems.forEach((item) =>
      transaction.objectStore(CASAE_STORES.purchaseItems).put(item),
    );
    catalog.products.forEach((product) =>
      transaction.objectStore(CASAE_STORES.products).put(product),
    );
    catalog.categories.forEach((category) =>
      transaction.objectStore(CASAE_STORES.categories).put(category),
    );
    transaction.objectStore(CASAE_STORES.metadata).put({
      key: CATALOG_MIGRATION_KEY,
      value: true,
      completedAt: new Date().toISOString(),
    });
    await transactionToPromise(transaction);
  }

  private async initializeMemoryDatabase() {
    if (!this.memoryDatabase.metadata.get(MIGRATION_KEY)?.value) {
      const snapshot =
        this.migrateLegacy && this.readLegacyInMemory
          ? await this.legacyReader()
          : {
              shoppingDatabaseFound: false,
              shoppingSeeded: false,
              shoppingItems: [],
              purchaseDatabaseFound: false,
              purchaseSessions: [],
              purchaseItems: [],
            };
      const prepared = prepareLegacyData(snapshot);
      snapshot.shoppingItems.forEach((item) =>
        this.memoryDatabase.shoppingItems.set(item.id, item),
      );
      prepared.sessions.forEach((session) =>
        this.memoryDatabase.purchaseSessions.set(session.id, session),
      );
      prepared.items.forEach((item) => this.memoryDatabase.purchaseItems.set(item.id, item));
      prepared.stores.forEach((store) => this.memoryDatabase.stores.set(store.id, store));

      const shouldSeed =
        this.memoryDatabase.shoppingItems.size === 0 && !snapshot.shoppingDatabaseFound;
      if (shouldSeed) {
        initialShoppingListSeed.forEach((item) =>
          this.memoryDatabase.shoppingItems.set(item.id, { ...item }),
        );
      }

      this.memoryDatabase.metadata.set(SEED_KEY, {
        key: SEED_KEY,
        value: shouldSeed || snapshot.shoppingSeeded,
      });
      this.memoryDatabase.metadata.set(MIGRATION_KEY, {
        key: MIGRATION_KEY,
        value: true,
        completedAt: new Date().toISOString(),
      });
    }

    if (!this.memoryDatabase.metadata.get(CATALOG_MIGRATION_KEY)?.value) {
      const catalog = prepareCatalogData(
        [...this.memoryDatabase.shoppingItems.values()],
        [...this.memoryDatabase.purchaseItems.values()],
        [...this.memoryDatabase.products.values()],
        [...this.memoryDatabase.categories.values()],
      );
      catalog.shoppingItems.forEach((item) => this.memoryDatabase.shoppingItems.set(item.id, item));
      catalog.purchaseItems.forEach((item) => this.memoryDatabase.purchaseItems.set(item.id, item));
      catalog.products.forEach((product) => this.memoryDatabase.products.set(product.id, product));
      catalog.categories.forEach((category) =>
        this.memoryDatabase.categories.set(category.id, category),
      );
      this.memoryDatabase.metadata.set(CATALOG_MIGRATION_KEY, {
        key: CATALOG_MIGRATION_KEY,
        value: true,
        completedAt: new Date().toISOString(),
      });
    }

    if (!this.memoryDatabase.metadata.get(RECURRENCE_MIGRATION_KEY)?.value) {
      this.memoryDatabase.products.forEach((product, id) => {
        this.memoryDatabase.products.set(id, {
          ...product,
          isRecurring: product.isRecurring === true,
          recurrenceDays:
            product.isRecurring === true &&
            Number.isInteger(product.recurrenceDays) &&
            product.recurrenceDays! >= 1 &&
            product.recurrenceDays! <= 365
              ? product.recurrenceDays
              : undefined,
        });
      });
      this.memoryDatabase.metadata.set(RECURRENCE_MIGRATION_KEY, {
        key: RECURRENCE_MIGRATION_KEY,
        value: true,
        completedAt: new Date().toISOString(),
      });
    }
  }
}
