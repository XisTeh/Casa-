import { describe, expect, it, vi } from 'vitest';
import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import type { PersistedPurchaseSession, PurchaseItem } from '../domain/purchase';
import { HOUSE_ID, type ShoppingListItem } from '../domain/shopping-list';
import {
  CASAE_DATABASE_VERSION,
  CASAE_STORES,
  CasaeLocalDatabase,
  type LegacyDatabaseSnapshot,
} from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalBudgetRepository } from '../infrastructure/budget/LocalBudgetRepository';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalHouseRepository } from '../infrastructure/house/LocalHouseRepository';
import { LEGACY_HOUSE_ID, LEGACY_MEMBER_NAME } from '../domain/house';

function databaseName(label: string) {
  return `casae-test-migration-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function legacySnapshot(): LegacyDatabaseSnapshot {
  const shoppingItem: ShoppingListItem = {
    id: 'legacy-list-item',
    houseId: HOUSE_ID,
    productName: 'Farinha',
    quantity: 1,
    unit: 'pacote',
    category: 'mercearia',
    preferredBrand: '',
    notes: '',
    priority: 'normal',
    status: 'pending',
    addedBy: 'Raabe',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
  };
  const session: PersistedPurchaseSession = {
    id: 'legacy-session',
    houseId: HOUSE_ID,
    storeNameSnapshot: 'Mercado Antigo',
    status: 'completed',
    startedAt: '2026-07-01T10:00:00.000Z',
    completedAt: '2026-07-01T11:00:00.000Z',
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents: 890,
  };
  const itemWithoutNewFields = {
    id: 'legacy-purchase-item',
    purchaseSessionId: session.id,
    sourceShoppingItemId: 'old-item',
    productNameSnapshot: 'Arroz',
    brandSnapshot: 'Marca antiga',
    categorySnapshot: 'mercearia',
    prioritySnapshot: 'normal',
    notesSnapshot: '',
    plannedQuantity: 1,
    purchasedQuantity: 1,
    unitSnapshot: 'pacote',
    unitPriceCents: 890,
    totalPriceCents: 890,
    storeNameSnapshot: 'Mercado Antigo',
    purchasedByNameSnapshot: 'Raabe',
    purchasedAt: '2026-07-01T10:30:00.000Z',
  } as unknown as PurchaseItem;
  return {
    shoppingDatabaseFound: true,
    shoppingSeeded: true,
    shoppingItems: [shoppingItem],
    purchaseDatabaseFound: true,
    purchaseSessions: [session],
    purchaseItems: [itemWithoutNewFields],
  };
}

function emptyLegacySnapshot(): LegacyDatabaseSnapshot {
  return {
    shoppingDatabaseFound: false,
    shoppingSeeded: false,
    shoppingItems: [],
    purchaseDatabaseFound: false,
    purchaseSessions: [],
    purchaseItems: [],
  };
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`O banco ${name} permaneceu aberto.`));
  });
}

async function expectLegacyDomainsEmpty(database: CasaeLocalDatabase) {
  await expect(new LocalShoppingRepository(database).list(LEGACY_HOUSE_ID)).resolves.toEqual([]);
  await expect(new LocalProductRepository(database).list(LEGACY_HOUSE_ID)).resolves.toEqual([]);
  await expect(new LocalCategoryRepository(database).list(LEGACY_HOUSE_ID)).resolves.toEqual([]);
  await expect(new LocalStoreRepository(database).list(LEGACY_HOUSE_ID)).resolves.toEqual([]);
}

function createVersionTwoDatabase(name: string, item: ShoppingListItem) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      const shoppingItems = database.createObjectStore(CASAE_STORES.shoppingItems, {
        keyPath: 'id',
      });
      shoppingItems.createIndex('houseId', 'houseId', { unique: false });
      const sessions = database.createObjectStore(CASAE_STORES.purchaseSessions, {
        keyPath: 'id',
      });
      sessions.createIndex('houseId', 'houseId', { unique: false });
      const purchaseItems = database.createObjectStore(CASAE_STORES.purchaseItems, {
        keyPath: 'id',
      });
      purchaseItems.createIndex('houseId', 'houseId', { unique: false });
      purchaseItems.createIndex('purchaseSessionId', 'purchaseSessionId', { unique: false });
      purchaseItems.createIndex('productId', 'productId', { unique: false });
      const stores = database.createObjectStore(CASAE_STORES.stores, { keyPath: 'id' });
      stores.createIndex('houseId', 'houseId', { unique: false });
      const products = database.createObjectStore(CASAE_STORES.products, { keyPath: 'id' });
      products.createIndex('houseId', 'houseId', { unique: false });
      products.createIndex('houseAndNormalizedName', ['houseId', 'normalizedName'], {
        unique: false,
      });
      const categories = database.createObjectStore(CASAE_STORES.categories, { keyPath: 'id' });
      categories.createIndex('houseId', 'houseId', { unique: false });
      categories.createIndex('houseAndNormalizedName', ['houseId', 'normalizedName'], {
        unique: true,
      });
      database.createObjectStore(CASAE_STORES.metadata, { keyPath: 'key' });
      shoppingItems.put(item);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function createPopulatedVersionThreeDatabase(name: string) {
  const snapshot = legacySnapshot();
  const item = snapshot.shoppingItems[0]!;
  await createVersionTwoDatabase(name, item);
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = () => {
      const budgets = request.result.createObjectStore(CASAE_STORES.houseBudgets, {
        keyPath: 'id',
      });
      budgets.createIndex('houseId', 'houseId', { unique: false });
      budgets.createIndex('houseYearMonth', ['houseId', 'year', 'month'], { unique: true });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(
        Object.values(CASAE_STORES).filter(
          (store) =>
            store !== CASAE_STORES.houses &&
            store !== CASAE_STORES.houseMembers &&
            store !== CASAE_STORES.profileAvatars &&
            store !== CASAE_STORES.syncOutbox,
        ),
        'readwrite',
      );
      transaction.objectStore(CASAE_STORES.categories).put({
        id: 'category-v3',
        houseId: HOUSE_ID,
        name: 'Mercearia',
        normalizedName: 'mercearia',
        legacyKey: 'mercearia',
        active: true,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      transaction.objectStore(CASAE_STORES.products).put({
        id: 'product-v3',
        houseId: HOUSE_ID,
        name: 'Farinha',
        normalizedName: 'farinha',
        brand: '',
        categoryId: 'category-v3',
        defaultUnit: 'pacote',
        notes: '',
        favorite: false,
        active: true,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      transaction.objectStore(CASAE_STORES.stores).put({
        id: 'store-v3',
        houseId: HOUSE_ID,
        name: 'Mercado v3',
        nickname: '',
        address: '',
        notes: '',
        active: true,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      const session = { ...snapshot.purchaseSessions[0]!, storeId: 'store-v3' };
      transaction.objectStore(CASAE_STORES.purchaseSessions).put(session);
      transaction.objectStore(CASAE_STORES.purchaseItems).put({
        ...snapshot.purchaseItems[0]!,
        houseId: HOUSE_ID,
        storeId: 'store-v3',
        productId: 'product-v3',
      });
      transaction.objectStore(CASAE_STORES.houseBudgets).put({
        id: `${HOUSE_ID}:2026-08`,
        houseId: HOUSE_ID,
        year: 2026,
        month: 8,
        amountCents: 50_000,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      const metadata = transaction.objectStore(CASAE_STORES.metadata);
      metadata.put({ key: 'legacy-databases-to-casae-local-v1', value: true });
      metadata.put({ key: 'catalog-products-categories-v2', value: true });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('CasaeLocalDatabase', () => {
  it('migra Lista, compras e mercado legado uma única vez sem recriar seed', async () => {
    const name = databaseName('idempotent');
    const reader = vi.fn(async () => legacySnapshot());
    const firstDatabase = new CasaeLocalDatabase(name, {
      migrateLegacy: true,
      legacyReader: reader,
    });
    await firstDatabase.initialize();
    const shopping = new LocalShoppingRepository(firstDatabase);
    const purchases = new LocalPurchaseRepository(firstDatabase);
    const stores = new LocalStoreRepository(firstDatabase);
    const products = new LocalProductRepository(firstDatabase);
    const categories = new LocalCategoryRepository(firstDatabase);

    expect((await shopping.list(HOUSE_ID)).map((item) => item.id)).toEqual(['legacy-list-item']);
    expect(await purchases.listCompletedSessions(HOUSE_ID)).toMatchObject([
      {
        id: 'legacy-session',
        storeId: expect.any(String),
        items: [{ houseId: HOUSE_ID, storeId: expect.any(String) }],
      },
    ]);
    expect(await stores.list(HOUSE_ID)).toMatchObject([
      { name: 'Mercado Antigo', houseId: HOUSE_ID },
    ]);
    expect(await categories.list(HOUSE_ID)).toHaveLength(11);
    expect(await products.list(HOUSE_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Farinha' }),
        expect.objectContaining({ name: 'Arroz' }),
      ]),
    );
    expect((await shopping.list(HOUSE_ID))[0]).toMatchObject({ productId: expect.any(String) });

    const restoredDatabase = new CasaeLocalDatabase(name, {
      migrateLegacy: true,
      legacyReader: reader,
    });
    await restoredDatabase.initialize();
    expect(reader).toHaveBeenCalledTimes(1);
    expect(
      await new LocalPurchaseRepository(restoredDatabase).listCompletedSessions(HOUSE_ID),
    ).toHaveLength(1);
    expect(await new LocalProductRepository(restoredDatabase).list(HOUSE_ID)).toHaveLength(2);
    expect(await new LocalCategoryRepository(restoredDatabase).list(HOUSE_ID)).toHaveLength(11);
  });

  it('preserva uma lista legada vazia sem recriar os itens demonstrativos', async () => {
    const database = new CasaeLocalDatabase(databaseName('empty-list'), {
      migrateLegacy: true,
      legacyReader: async () => ({ ...legacySnapshot(), shoppingItems: [] }),
    });
    expect(await new LocalShoppingRepository(database).list(HOUSE_ID)).toEqual([]);
  });

  it('inicializa um IndexedDB novo sem dados demonstrativos no espaço legacy', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const reader = vi.fn(async () => emptyLegacySnapshot());
    const database = new CasaeLocalDatabase(databaseName('clean-install'), {
      migrateLegacy: true,
      legacyReader: reader,
    });

    await database.initialize();

    await expectLegacyDomainsEmpty(database);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('continua vazio ao recriar o IndexedDB depois de limpar os dados do site', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const name = databaseName('clear-and-reopen');
    const reader = vi.fn(async () => emptyLegacySnapshot());
    const firstDatabase = new CasaeLocalDatabase(name, {
      migrateLegacy: true,
      legacyReader: reader,
    });
    await firstDatabase.initialize();
    await expectLegacyDomainsEmpty(firstDatabase);
    (await firstDatabase.getNativeDatabase())?.close();
    await deleteDatabase(name);

    const reopenedDatabase = new CasaeLocalDatabase(name, {
      migrateLegacy: true,
      legacyReader: reader,
    });
    await reopenedDatabase.initialize();

    await expectLegacyDomainsEmpty(reopenedDatabase);
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('atualiza a versão 2 para a 5 preservando dados e adicionando orçamentos', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const name = databaseName('v2-to-v3');
    const [existingItem] = legacySnapshot().shoppingItems;
    if (!existingItem) throw new Error('O cenário v2 precisa de um item existente.');
    await createVersionTwoDatabase(name, existingItem);

    const database = new CasaeLocalDatabase(name, { migrateLegacy: false });
    await database.initialize();
    const nativeDatabase = await database.getNativeDatabase();

    expect(nativeDatabase?.version).toBe(CASAE_DATABASE_VERSION);
    expect(nativeDatabase?.objectStoreNames.contains(CASAE_STORES.houseBudgets)).toBe(true);
    expect(await new LocalShoppingRepository(database).list(HOUSE_ID)).toMatchObject([
      existingItem,
    ]);

    const budgets = new LocalBudgetRepository(database);
    await budgets.save({
      id: `${HOUSE_ID}:2026-08`,
      houseId: HOUSE_ID,
      year: 2026,
      month: 8,
      amountCents: 150_000,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    });
    expect(await budgets.getByMonth(HOUSE_ID, 2026, 8)).toMatchObject({
      amountCents: 150_000,
    });
  });

  it('migra um banco v3 populado para v6 preservando domínios, identidade e recorrência', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const name = databaseName('v3-to-v4');
    await createPopulatedVersionThreeDatabase(name);

    const database = new CasaeLocalDatabase(name, { migrateLegacy: false });
    await database.initialize();
    const native = await database.getNativeDatabase();
    const houses = new LocalHouseRepository(database);

    expect(native?.version).toBe(CASAE_DATABASE_VERSION);
    expect(native?.objectStoreNames.contains(CASAE_STORES.houses)).toBe(true);
    expect(native?.objectStoreNames.contains(CASAE_STORES.houseMembers)).toBe(true);
    expect(native?.objectStoreNames.contains(CASAE_STORES.profileAvatars)).toBe(true);
    expect(native?.objectStoreNames.contains(CASAE_STORES.syncOutbox)).toBe(true);
    expect(await houses.listHouses()).toMatchObject([{ id: LEGACY_HOUSE_ID }]);
    expect(await houses.listMembers(LEGACY_HOUSE_ID)).toMatchObject([
      { displayName: LEGACY_MEMBER_NAME, role: 'owner' },
    ]);
    expect(await houses.getActiveHouseId()).toBe(LEGACY_HOUSE_ID);
    expect(await new LocalShoppingRepository(database).list(HOUSE_ID)).toHaveLength(1);
    expect(await new LocalProductRepository(database).list(HOUSE_ID)).toMatchObject([
      { isRecurring: false, recurrenceDays: undefined },
    ]);
    expect(await new LocalCategoryRepository(database).list(HOUSE_ID)).toHaveLength(1);
    expect(await new LocalStoreRepository(database).list(HOUSE_ID)).toHaveLength(1);
    expect(
      await new LocalPurchaseRepository(database).listCompletedSessions(HOUSE_ID),
    ).toHaveLength(1);
    expect(await new LocalBudgetRepository(database).list(HOUSE_ID)).toHaveLength(1);
  });

  it('substitui atomicamente o snapshot de compras de uma Casa no IndexedDB real', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    const database = new CasaeLocalDatabase(databaseName('purchase-snapshot'), {
      migrateLegacy: false,
    });
    const repository = new LocalPurchaseRepository(database);
    const first = legacySnapshot();
    await repository.putPersistedSession(first.purchaseSessions[0]!);
    await repository.putPersistedItem(first.purchaseItems[0]!);

    const session: PersistedPurchaseSession = {
      ...first.purchaseSessions[0]!,
      id: 'remote-session',
      syncId: 'remote-session',
      totalPriceCents: 750,
    };
    const item: PurchaseItem = {
      ...first.purchaseItems[0]!,
      id: 'remote-item',
      syncId: 'remote-item',
      houseId: HOUSE_ID,
      purchaseSessionId: session.id,
      totalPriceCents: 750,
      unitPriceCents: 750,
    };
    await repository.replaceHouseSnapshot(HOUSE_ID, [session], [item]);

    expect(await repository.listPersistedSessions(HOUSE_ID)).toEqual([session]);
    expect(await repository.listPersistedItems(HOUSE_ID)).toEqual([expect.objectContaining(item)]);
    expect(await repository.listCompletedSessions(HOUSE_ID)).toEqual([
      expect.objectContaining({ id: session.id, totalPriceCents: 750 }),
    ]);
  });
});
