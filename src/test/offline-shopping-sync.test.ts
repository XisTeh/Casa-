import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { ShoppingListService } from '../application/shopping-list-service';
import { LEGACY_HOUSE_ID } from '../domain/house';
import { initialShoppingListSeed, type ShoppingListItem } from '../domain/shopping-list';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import {
  OfflineFirstShoppingRepository,
  type ShoppingSyncRuntime,
} from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type { RemoteShoppingStore } from '../infrastructure/supabase/SupabaseShoppingRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

const HOUSE_A = 'a0000000-0000-4000-8000-000000000001';
const HOUSE_B = 'b0000000-0000-4000-8000-000000000002';
const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';

function copy<T>(value: T): T {
  return structuredClone(value);
}

class TestRuntime implements ShoppingSyncRuntime {
  online = false;
  current = new Date('2026-08-26T12:00:00.000Z');
  onlineListeners = new Set<() => void>();
  visibleListeners = new Set<() => void>();
  scheduled: (() => void)[] = [];
  isOnline = () => this.online;
  now = () => new Date(this.current);
  addOnlineListener = (listener: () => void) => {
    this.onlineListeners.add(listener);
    return () => this.onlineListeners.delete(listener);
  };
  addVisibleListener = (listener: () => void) => {
    this.visibleListeners.add(listener);
    return () => this.visibleListeners.delete(listener);
  };
  schedule = (listener: () => void, delay: number) => {
    void delay;
    this.scheduled.push(listener);
    return this.scheduled.length as unknown as ReturnType<typeof setTimeout>;
  };
  cancel = (timer: ReturnType<typeof setTimeout>) => {
    void timer;
  };
  advance(milliseconds: number) {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class FakeRemoteShoppingStore implements RemoteShoppingStore {
  items = new Map<string, ShoppingListItem>();
  subscribers = new Map<string, Set<(item: ShoppingListItem) => void>>();
  applyCalls: ShoppingListItem[] = [];
  failApplies = 0;
  currentUserId = USER_A;

  async getCurrentUserId() {
    return this.currentUserId;
  }

  async list(houseId: string) {
    return [...this.items.values()].filter((item) => item.houseId === houseId).map(copy);
  }

  async apply(item: ShoppingListItem) {
    this.applyCalls.push(copy(item));
    if (this.failApplies-- > 0) throw new Error('rede indisponível');
    const current = this.items.get(item.id);
    if (
      !current ||
      item.updatedAt > current.updatedAt ||
      (item.updatedAt === current.updatedAt && item.deletedAt && !current.deletedAt)
    ) {
      this.items.set(item.id, copy(item));
    }
    return copy(this.items.get(item.id)!);
  }

  subscribe(houseId: string, receive: (item: ShoppingListItem) => void) {
    const listeners = this.subscribers.get(houseId) ?? new Set();
    listeners.add(receive);
    this.subscribers.set(houseId, listeners);
    return () => listeners.delete(receive);
  }

  emit(item: ShoppingListItem) {
    this.items.set(item.id, copy(item));
    this.subscribers.get(item.houseId)?.forEach((listener) => listener(copy(item)));
  }
}

function databaseName(label: string) {
  return `casae-sync-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function input(name = 'Café') {
  return {
    productName: name,
    quantity: 1,
    unit: 'pacote' as const,
    category: 'mercearia' as const,
    preferredBrand: '',
    notes: '',
    priority: 'normal' as const,
  };
}

function actor(houseId = HOUSE_A) {
  return { houseId, memberId: USER_A, memberName: 'Raabe' };
}

beforeEach(() => {
  vi.stubGlobal('indexedDB', fakeIndexedDB);
  vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
});

describe('sincronização offline-first da Lista', () => {
  it('mantém uma outbox offline atual funcionando normalmente', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    const database = new CasaeLocalDatabase(databaseName('pending-is-not-legacy'), {
      migrateLegacy: false,
    });
    await database.initialize();
    database.getMemoryDatabase().shoppingItems.clear();
    const repository = new OfflineFirstShoppingRepository(database, remote, USER_A, runtime);
    const service = new ShoppingListService(repository);

    await service.create(input('Item offline atual'), actor());

    expect(await repository.getStatus(HOUSE_A)).toMatchObject({ state: 'offline', pending: 1 });
  });

  it('persiste e compacta create/update/delete offline, retoma no reload e envia tombstone uma vez', async () => {
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    const database = new CasaeLocalDatabase(databaseName('offline'), { migrateLegacy: false });
    const firstRepository = new OfflineFirstShoppingRepository(database, remote, USER_A, runtime);
    const firstService = new ShoppingListService(firstRepository);

    const created = await firstService.create(input(), actor());
    await firstService.update(created.id, { quantity: 2 }, HOUSE_A, USER_A);
    await firstService.remove(created.id, HOUSE_A, USER_A);

    expect(await firstService.list(HOUSE_A)).toEqual([]);
    expect(await firstService.getSyncStatus(HOUSE_A)).toMatchObject({
      state: 'offline',
      pending: 1,
    });

    const restoredService = new ShoppingListService(
      new OfflineFirstShoppingRepository(database, remote, USER_A, runtime),
    );
    expect(await restoredService.getSyncStatus(HOUSE_A)).toMatchObject({ pending: 1 });
    runtime.online = true;
    const restoredRepository = new OfflineFirstShoppingRepository(
      database,
      remote,
      USER_A,
      runtime,
    );
    await restoredRepository.syncNow(HOUSE_A);

    expect(remote.applyCalls).toHaveLength(1);
    expect(remote.applyCalls[0]).toMatchObject({ id: created.id, quantity: 2 });
    expect(remote.applyCalls[0]?.deletedAt).toBeTruthy();
    expect(await restoredRepository.getStatus(HOUSE_A)).toMatchObject({ pending: 0 });
    await restoredRepository.syncNow(HOUSE_A);
    expect(remote.applyCalls).toHaveLength(1);
  });

  it('mantém falha temporária na fila e tenta novamente com backoff controlado', async () => {
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    remote.failApplies = 1;
    const repository = new OfflineFirstShoppingRepository(
      new CasaeLocalDatabase(databaseName('retry'), { migrateLegacy: false }),
      remote,
      USER_A,
      runtime,
    );
    const service = new ShoppingListService(repository);
    await service.create(input('Arroz'), actor());
    runtime.online = true;
    await repository.syncNow(HOUSE_A);
    expect(await repository.getStatus(HOUSE_A)).toMatchObject({ pending: 1 });
    expect(runtime.scheduled).toHaveLength(1);

    runtime.advance(3_000);
    await repository.syncNow(HOUSE_A);
    expect(remote.applyCalls).toHaveLength(2);
    expect(await repository.getStatus(HOUSE_A)).toMatchObject({ state: 'synced', pending: 0 });
  });

  it('mescla Realtime, aplica last-write-wins, respeita tombstone e isola subscriptions por Casa', async () => {
    const runtime = new TestRuntime();
    runtime.online = true;
    const remote = new FakeRemoteShoppingStore();
    const repository = new OfflineFirstShoppingRepository(
      new CasaeLocalDatabase(databaseName('realtime'), { migrateLegacy: false }),
      remote,
      USER_A,
      runtime,
    );
    const changedA = vi.fn();
    const changedB = vi.fn();
    const unsubscribeA = repository.subscribe(HOUSE_A, changedA, () => undefined);
    const item: ShoppingListItem = {
      id: 'c0000000-0000-4000-8000-000000000003',
      houseId: HOUSE_A,
      ...input('Leite'),
      status: 'pending',
      addedBy: 'Sidney',
      createdAt: '2026-08-26T12:00:00.000Z',
      updatedAt: '2030-08-26T12:00:00.000Z',
    };
    remote.emit(item);
    await vi.waitFor(async () => expect(await repository.list(HOUSE_A)).toMatchObject([item]));

    remote.emit({
      ...item,
      deletedAt: '2030-08-26T12:01:00.000Z',
      updatedAt: '2030-08-26T12:01:00.000Z',
    });
    await vi.waitFor(async () => expect(await repository.list(HOUSE_A)).toEqual([]));
    unsubscribeA();
    repository.subscribe(HOUSE_B, changedB, () => undefined);
    remote.emit({ ...item, id: 'd0000000-0000-4000-8000-000000000004', deletedAt: undefined });
    await Promise.resolve();
    expect(changedB).not.toHaveBeenCalled();
  });

  it('ignora dados do LEGACY_HOUSE_ID sem misturar ou enviar para a Casa atual', async () => {
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    const database = new CasaeLocalDatabase(databaseName('legacy'), { migrateLegacy: false });
    const repository = new OfflineFirstShoppingRepository(database, remote, USER_A, runtime);
    await repository.initialize();
    const local = new LocalShoppingRepository(database);
    await local.create(initialShoppingListSeed[0]!);
    const legacyBefore = await local.list(LEGACY_HOUSE_ID);
    runtime.online = true;
    await repository.syncNow(HOUSE_A);

    expect(await repository.list(HOUSE_A)).toEqual([]);
    expect(remote.applyCalls).toEqual([]);
    expect(await new LocalShoppingRepository(database).list(LEGACY_HOUSE_ID)).toHaveLength(
      legacyBefore.length,
    );
    expect(await repository.getStatus(HOUSE_A)).toMatchObject({ pending: 0 });
  });

  it('não envia a outbox de uma conta usando a sessão de outra conta no mesmo dispositivo', async () => {
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    const database = new CasaeLocalDatabase(databaseName('account-isolation'), {
      migrateLegacy: false,
    });
    const accountA = new ShoppingListService(
      new OfflineFirstShoppingRepository(database, remote, USER_A, runtime),
    );
    const pending = await accountA.create(input('Feijão local'), actor());
    remote.items.set(pending.id, {
      ...pending,
      productName: 'Feijão remoto',
      updatedAt: new Date(new Date(pending.updatedAt).getTime() - 1_000).toISOString(),
      updatedByMemberId: USER_B,
    });

    remote.currentUserId = USER_B;
    runtime.online = true;
    const staleAccountA = new OfflineFirstShoppingRepository(database, remote, USER_A, runtime);
    await staleAccountA.syncNow(HOUSE_A);
    const accountB = new OfflineFirstShoppingRepository(
      database,
      remote,
      remote.currentUserId,
      runtime,
    );
    await accountB.syncNow(HOUSE_A);

    expect(remote.applyCalls).toEqual([]);
    expect(await staleAccountA.getStatus(HOUSE_A)).toMatchObject({ pending: 1 });
    expect(await accountB.getStatus(HOUSE_A)).toMatchObject({ pending: 0 });
    expect(await accountB.list(HOUSE_A)).toEqual([
      expect.objectContaining({ productName: 'Feijão remoto', updatedByMemberId: USER_B }),
    ]);
  });

  it('mantém inclusões independentes, envia somente a Casa solicitada e resolve update concorrente', async () => {
    const runtime = new TestRuntime();
    const remote = new FakeRemoteShoppingStore();
    const repository = new OfflineFirstShoppingRepository(
      new CasaeLocalDatabase(databaseName('concurrent'), { migrateLegacy: false }),
      remote,
      USER_A,
      runtime,
    );
    const service = new ShoppingListService(repository);
    const localA = await service.create(input('Arroz'), actor(HOUSE_A));
    await service.create(input('Sabão'), actor(HOUSE_B));
    remote.items.set(localA.id, {
      ...localA,
      quantity: 3,
      updatedAt: '2030-08-26T12:00:00.000Z',
      updatedByMemberId: '20000000-0000-4000-8000-000000000002',
    });

    runtime.online = true;
    await repository.syncNow(HOUSE_A);

    expect(remote.applyCalls).toEqual([]);
    expect(await repository.list(HOUSE_A)).toMatchObject([{ quantity: 3 }]);
    expect(await repository.getStatus(HOUSE_A)).toMatchObject({ pending: 0 });
    expect(await repository.getStatus(HOUSE_B)).toMatchObject({ pending: 1 });
    await repository.syncNow(HOUSE_B);
    expect(remote.applyCalls.map((item) => item.houseId)).toEqual([HOUSE_B]);
    expect([...remote.items.values()].filter((item) => !item.deletedAt)).toHaveLength(2);
  });
});
