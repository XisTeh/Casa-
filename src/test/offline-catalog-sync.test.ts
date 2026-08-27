import { describe, expect, it, vi } from 'vitest';
import type { Category, Product } from '../domain/catalog';
import type { CatalogEntityType } from '../domain/catalog-sync';
import { LEGACY_HOUSE_ID } from '../domain/house';
import type { Store } from '../domain/store';
import { OfflineFirstCatalogSync } from '../infrastructure/catalog/OfflineFirstCatalogRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import type { ShoppingSyncRuntime } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type {
  CatalogSyncEntity,
  RemoteCatalogSnapshot,
  RemoteCatalogStore,
} from '../infrastructure/supabase/SupabaseCatalogRepository';

const clone = <T>(value: T): T => structuredClone(value);
const HOUSE_A = '00000000-0000-4000-8000-000000000001';
const HOUSE_B = '00000000-0000-4000-8000-000000000002';
const USER = '00000000-0000-4000-8000-000000000010';
const USER_B = '00000000-0000-4000-8000-000000000020';
const stamp = '2026-08-26T12:00:00.000Z';

class Runtime implements ShoppingSyncRuntime {
  online = true;
  currentTime = new Date(stamp).getTime();
  onlineListeners = new Set<() => void>();
  isOnline = () => this.online;
  now = () => new Date(this.currentTime);
  addOnlineListener = (listener: () => void) => {
    this.onlineListeners.add(listener);
    return () => this.onlineListeners.delete(listener);
  };
  addVisibleListener = () => () => undefined;
  schedule = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
  cancel = vi.fn();
  reconnect() {
    this.online = true;
    this.onlineListeners.forEach((listener) => listener());
  }
  advance(milliseconds: number) {
    this.currentTime += milliseconds;
  }
}

class Remote implements RemoteCatalogStore {
  records = new Map<string, { type: CatalogEntityType; entity: CatalogSyncEntity }>();
  subscribers = new Map<
    string,
    Set<(type: CatalogEntityType, entity: CatalogSyncEntity) => void>
  >();
  applyCalls = 0;
  failures = 0;
  subscribeCalls = 0;
  unsubscribeCalls = 0;
  currentUserId = USER;
  async getCurrentUserId() {
    return this.currentUserId;
  }
  async list(houseId: string): Promise<RemoteCatalogSnapshot> {
    const values = [...this.records.values()].filter(({ entity }) => entity.houseId === houseId);
    return {
      categories: values
        .filter(({ type }) => type === 'category')
        .map(({ entity }) => clone(entity as Category)),
      products: values
        .filter(({ type }) => type === 'product')
        .map(({ entity }) => clone(entity as Product)),
      stores: values
        .filter(({ type }) => type === 'store')
        .map(({ entity }) => clone(entity as Store)),
    };
  }
  async apply(type: CatalogEntityType, entity: CatalogSyncEntity) {
    this.applyCalls += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('Falha temporária simulada.');
    }
    const id = entity.syncId ?? entity.id;
    const remote = { ...clone(entity), id, syncId: id } as CatalogSyncEntity;
    const key = `${type}:${id}`;
    const current = this.records.get(key)?.entity;
    if (!current || remote.updatedAt >= current.updatedAt)
      this.records.set(key, { type, entity: remote });
    const result = clone(this.records.get(key)!.entity);
    this.subscribers.get(entity.houseId)?.forEach((listener) => listener(type, result));
    return result;
  }
  subscribe(
    houseId: string,
    receive: (type: CatalogEntityType, entity: CatalogSyncEntity) => void,
  ) {
    this.subscribeCalls += 1;
    const listeners = this.subscribers.get(houseId) ?? new Set();
    listeners.add(receive);
    this.subscribers.set(houseId, listeners);
    return () => {
      this.unsubscribeCalls += 1;
      listeners.delete(receive);
    };
  }
  emit(type: CatalogEntityType, entity: CatalogSyncEntity) {
    this.records.set(`${type}:${entity.id}`, { type, entity: clone(entity) });
    this.subscribers.get(entity.houseId)?.forEach((listener) => listener(type, clone(entity)));
  }
}

function category(id: string = crypto.randomUUID(), houseId = HOUSE_A): Category {
  return {
    id,
    houseId,
    name: 'Outros',
    normalizedName: 'outros',
    legacyKey: 'outros',
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
function product(categoryId: string, id: string = crypto.randomUUID(), houseId = HOUSE_A): Product {
  return {
    id,
    houseId,
    categoryId,
    name: 'Arroz',
    normalizedName: 'arroz',
    brand: '',
    defaultUnit: 'pacote',
    notes: '',
    favorite: false,
    isRecurring: true,
    recurrenceDays: 30,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
function store(id: string = crypto.randomUUID(), houseId = HOUSE_A): Store {
  return {
    id,
    houseId,
    name: 'Atacadão',
    normalizedName: 'atacadao',
    nickname: '',
    address: '',
    notes: '',
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe('OfflineFirstCatalogSync', () => {
  it('grava categorias, produtos e mercados localmente offline e envia a mesma outbox ao reconectar', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const remote = new Remote();
    const databaseName = `catalog-offline-${Math.random()}`;
    const database = new CasaeLocalDatabase(databaseName, {
      migrateLegacy: false,
    });
    const sync = new OfflineFirstCatalogSync(database, remote, runtime);
    const savedCategory = await sync.categories.save(category());
    await sync.products.save(product(savedCategory.id));
    await sync.stores.create(store());
    expect(await sync.getStatus(HOUSE_A)).toMatchObject({ state: 'offline', pending: 3 });
    expect(await sync.categories.list(HOUSE_A)).toHaveLength(1);

    const reloadedSync = new OfflineFirstCatalogSync(
      new CasaeLocalDatabase(databaseName, { migrateLegacy: false }),
      remote,
      runtime,
    );
    expect(await reloadedSync.getStatus(HOUSE_A)).toMatchObject({ state: 'offline', pending: 3 });
    expect(await reloadedSync.products.list(HOUSE_A)).toHaveLength(1);

    runtime.reconnect();
    await reloadedSync.syncNow(HOUSE_A);
    expect(remote.applyCalls).toBe(3);
    expect(await reloadedSync.getStatus(HOUSE_A)).toMatchObject({ state: 'synced', pending: 0 });
    expect((await remote.list(HOUSE_A)).products[0]).toMatchObject({
      isRecurring: true,
      recurrenceDays: 30,
    });
  });

  it('mescla defaults pela chave, recebe Realtime sem gerar outbox e isola Casas', async () => {
    const runtime = new Runtime();
    const remote = new Remote();
    const remoteDefault = { ...category(crypto.randomUUID()), syncId: undefined };
    remote.records.set(`category:${remoteDefault.id}`, { type: 'category', entity: remoteDefault });
    const database = new CasaeLocalDatabase(`catalog-realtime-${Math.random()}`, {
      migrateLegacy: false,
    });
    const sync = new OfflineFirstCatalogSync(database, remote, runtime);
    await sync.ensureDefaults(HOUSE_A, [{ name: 'Outros', legacyKey: 'outros' }]);
    expect(
      (await sync.categories.list(HOUSE_A)).filter((item) => item.legacyKey === 'outros'),
    ).toHaveLength(1);
    const changed = vi.fn();
    const unsubscribe = sync.subscribe(HOUSE_A, changed);
    const secondChanged = vi.fn();
    const secondUnsubscribe = sync.subscribe(HOUSE_A, secondChanged);
    expect(remote.subscribeCalls).toBe(1);
    remote.emit('store', {
      ...store(crypto.randomUUID(), HOUSE_A),
      updatedAt: '2026-08-26T13:00:00.000Z',
    });
    remote.emit('store', store(crypto.randomUUID(), HOUSE_B));
    await vi.waitFor(async () => expect(await sync.stores.list(HOUSE_A)).toHaveLength(1));
    expect(await sync.stores.list(HOUSE_B)).toHaveLength(0);
    expect((await sync.getStatus(HOUSE_A)).pending).toBe(0);
    unsubscribe();
    expect(remote.unsubscribeCalls).toBe(0);
    secondUnsubscribe();
    expect(remote.unsubscribeCalls).toBe(1);
  });

  it('sincroniza edições, favorito, recorrência e tombstone sem ressuscitar por evento antigo', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const remote = new Remote();
    const sync = new OfflineFirstCatalogSync(
      new CasaeLocalDatabase(`catalog-mutations-${Math.random()}`, { migrateLegacy: false }),
      remote,
      runtime,
    );
    const savedCategory = await sync.categories.save(category());
    const savedProduct = await sync.products.save(product(savedCategory.id));
    const savedStore = await sync.stores.create(store());
    await sync.categories.save({
      ...savedCategory,
      name: 'Itens diversos',
      normalizedName: 'itens diversos',
      updatedAt: '2026-08-26T13:00:00.000Z',
    });
    await sync.products.save({
      ...savedProduct,
      favorite: true,
      active: false,
      isRecurring: true,
      recurrenceDays: 14,
      updatedAt: '2026-08-26T13:00:00.000Z',
    });
    runtime.currentTime = new Date('2026-08-26T14:00:00.000Z').getTime();
    await sync.removeStore(HOUSE_A, savedStore.id);

    runtime.reconnect();
    await sync.syncNow(HOUSE_A);
    const snapshot = await remote.list(HOUSE_A);
    expect(snapshot.categories[0]).toMatchObject({ name: 'Itens diversos' });
    expect(snapshot.products[0]).toMatchObject({
      categoryId: snapshot.categories[0]!.id,
      favorite: true,
      active: false,
      isRecurring: true,
      recurrenceDays: 14,
    });
    expect(snapshot.stores[0]?.deletedAt).toBe('2026-08-26T14:00:00.000Z');

    remote.emit('store', {
      ...savedStore,
      id: snapshot.stores[0]!.id,
      syncId: snapshot.stores[0]!.id,
      updatedAt: '2026-08-26T13:30:00.000Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await sync.stores.list(HOUSE_A)).toHaveLength(0);
    expect((await sync.getStatus(HOUSE_A)).pending).toBe(0);
  });

  it('registra falha, aplica backoff e conclui retry idempotente pela mesma outbox', async () => {
    const runtime = new Runtime();
    const remote = new Remote();
    remote.failures = 1;
    const database = new CasaeLocalDatabase(`catalog-retry-${Math.random()}`, {
      migrateLegacy: false,
    });
    const sync = new OfflineFirstCatalogSync(database, remote, runtime);
    await sync.categories.save(category());
    await vi.waitFor(async () =>
      expect(await sync.getStatus(HOUSE_A)).toMatchObject({ state: 'error', pending: 1 }),
    );
    const pending = [...database.getMemoryDatabase().syncOutbox.values()].find(
      (entry) => entry.entityType === 'category',
    );
    expect(pending).toMatchObject({ attempts: 1, lastError: 'Falha temporária simulada.' });
    runtime.advance(3_000);
    await sync.syncNow(HOUSE_A);
    expect(await sync.getStatus(HOUSE_A)).toMatchObject({ state: 'synced', pending: 0 });
    expect((await remote.list(HOUSE_A)).categories).toHaveLength(1);
  });

  it('mantém outboxes e sincronização isoladas durante a troca de Casa', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const remote = new Remote();
    const sync = new OfflineFirstCatalogSync(
      new CasaeLocalDatabase(`catalog-houses-${Math.random()}`, { migrateLegacy: false }),
      remote,
      runtime,
    );
    await sync.categories.save(category(crypto.randomUUID(), HOUSE_A));
    await sync.categories.save(category(crypto.randomUUID(), HOUSE_B));
    runtime.reconnect();
    await sync.syncNow(HOUSE_A);
    expect((await remote.list(HOUSE_A)).categories).toHaveLength(1);
    expect((await remote.list(HOUSE_B)).categories).toHaveLength(0);
    expect((await sync.getStatus(HOUSE_B)).pending).toBe(1);
    await sync.syncNow(HOUSE_B);
    expect((await remote.list(HOUSE_B)).categories).toHaveLength(1);
  });

  it('não deixa catálogo pendente de outra conta bloquear o snapshot remoto', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const remote = new Remote();
    const database = new CasaeLocalDatabase(`catalog-shared-account-${Math.random()}`, {
      migrateLegacy: false,
    });
    const accountA = new OfflineFirstCatalogSync(database, remote, runtime, USER);
    const pending = await accountA.categories.save({
      ...category('00000000-0000-4000-8000-000000000099'),
      name: 'Categoria local',
      normalizedName: 'categoria local',
      legacyKey: undefined,
    });
    const remoteVersion: Category = {
      ...pending,
      id: pending.syncId ?? pending.id,
      syncId: pending.syncId ?? pending.id,
      name: 'Categoria remota',
      normalizedName: 'categoria remota',
      updatedAt: '2026-08-26T11:59:59.000Z',
    };
    remote.records.set(`category:${remoteVersion.id}`, {
      type: 'category',
      entity: remoteVersion,
    });

    remote.currentUserId = USER_B;
    runtime.online = true;
    const accountB = new OfflineFirstCatalogSync(database, remote, runtime, USER_B);
    await accountB.syncNow(HOUSE_A);

    expect(await accountB.categories.list(HOUSE_A)).toEqual([
      expect.objectContaining({ name: 'Categoria remota' }),
    ]);
    expect(await accountB.getStatus(HOUSE_A)).toMatchObject({ state: 'synced', pending: 0 });
    expect(await accountA.getStatus(HOUSE_A)).toMatchObject({ pending: 1 });
  });

  it('preserva IDs legados, não envia antes da confirmação e torna a importação idempotente', async () => {
    const runtime = new Runtime();
    const remote = new Remote();
    const database = new CasaeLocalDatabase(`catalog-legacy-${Math.random()}`, {
      migrateLegacy: false,
    });
    await database.initialize();
    const legacy = category('category-old', LEGACY_HOUSE_ID);
    const legacyProduct = product(legacy.id, 'product-old', LEGACY_HOUSE_ID);
    const legacyStore = store('store-old', LEGACY_HOUSE_ID);
    database.getMemoryDatabase().categories.set(legacy.id, legacy);
    database.getMemoryDatabase().products.set(legacyProduct.id, legacyProduct);
    database.getMemoryDatabase().stores.set(legacyStore.id, legacyStore);
    const sync = new OfflineFirstCatalogSync(database, remote, runtime);
    const migration = await sync.getLegacyMigration(HOUSE_A);
    expect(migration?.categories).toBeGreaterThanOrEqual(1);
    expect(migration?.products).toBeGreaterThanOrEqual(1);
    expect(migration?.stores).toBeGreaterThanOrEqual(1);
    expect(remote.applyCalls).toBe(0);
    await migration!.importIntoHouse();
    const restored = (await sync.categories.list(HOUSE_A)).find(
      (item) => item.name === legacy.name,
    );
    expect(restored?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(restored?.syncId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (await sync.products.list(HOUSE_A)).some((item) => item.name === legacyProduct.name),
    ).toBe(true);
    expect((await sync.stores.list(HOUSE_A)).some((item) => item.name === legacyStore.name)).toBe(
      true,
    );
    const appliedOnce = remote.applyCalls;
    await migration!.importIntoHouse();
    expect(remote.applyCalls).toBe(appliedOnce);
    const snapshot = await remote.list(HOUSE_A);
    expect(snapshot.products[0]?.categoryId).toBe(snapshot.categories[0]?.id);
    expect(await sync.getLegacyMigration(HOUSE_A)).toBeNull();
  });

  it('não classifica dados locais da Casa atual como legacy', async () => {
    const runtime = new Runtime();
    const database = new CasaeLocalDatabase(`catalog-current-house-${Math.random()}`, {
      migrateLegacy: false,
    });
    await database.initialize();
    database.getMemoryDatabase().categories.clear();
    database.getMemoryDatabase().products.clear();
    database.getMemoryDatabase().stores.clear();
    const current = category('current-category', HOUSE_A);
    database.getMemoryDatabase().categories.set(current.id, current);

    const sync = new OfflineFirstCatalogSync(database, new Remote(), runtime);

    expect(await sync.getLegacyMigration(HOUSE_A)).toBeNull();
  });
});
