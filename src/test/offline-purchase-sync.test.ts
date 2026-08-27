import { describe, expect, it, vi } from 'vitest';
import { IDBKeyRange as FakeIDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { PurchaseService } from '../application/purchase-service';
import type { PersistedPurchaseSession, PurchaseItem } from '../domain/purchase';
import { purchaseSessionFingerprint } from '../domain/purchase-fingerprint';
import type { PurchaseSyncEntityType } from '../domain/purchase-sync';
import { LEGACY_HOUSE_ID } from '../domain/house';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  transactionToPromise,
} from '../infrastructure/local-database/CasaeLocalDatabase';
import { OfflineFirstPurchaseRepository } from '../infrastructure/purchase/OfflineFirstPurchaseRepository';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import type { ShoppingSyncRuntime } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type {
  RemotePurchaseEntity,
  RemotePurchaseSnapshot,
  RemotePurchaseStore,
} from '../infrastructure/supabase/SupabasePurchaseRepository';

const HOUSE = '00000000-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-000000000010';
const USER_B = '00000000-0000-4000-8000-000000000020';
const USER_C = '00000000-0000-4000-8000-000000000030';

const clone = <T>(value: T): T => structuredClone(value);

class Runtime implements ShoppingSyncRuntime {
  online = true;
  currentTime = new Date('2026-08-26T12:00:00.000Z').getTime();
  listeners = new Set<() => void>();
  isOnline = () => this.online;
  now = () => new Date(this.currentTime);
  addOnlineListener = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  addVisibleListener = () => () => undefined;
  schedule = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
  cancel = vi.fn();
  reconnect() {
    this.online = true;
    this.listeners.forEach((listener) => listener());
  }
  advance(milliseconds: number) {
    this.currentTime += milliseconds;
  }
}

class RemoteBackend {
  sessions = new Map<string, PersistedPurchaseSession>();
  items = new Map<string, PurchaseItem>();
  listeners = new Map<
    string,
    Set<(type: PurchaseSyncEntityType, entity: RemotePurchaseEntity) => void>
  >();
  failItemOnce = new Set<string>();
  applied: Array<{ type: PurchaseSyncEntityType; id: string; status?: string }> = [];
  listCalls = 0;
  nextListGate?: { entered: () => void; wait: Promise<void> };
  emit(type: PurchaseSyncEntityType, entity: RemotePurchaseEntity) {
    this.listeners.get(entity.houseId)?.forEach((listener) => listener(type, clone(entity)));
  }
}

class Remote implements RemotePurchaseStore {
  constructor(
    private readonly backend: RemoteBackend,
    private readonly userId: string,
  ) {}

  async getCurrentUserId() {
    return this.userId;
  }

  async list(houseId: string): Promise<RemotePurchaseSnapshot> {
    this.backend.listCalls += 1;
    const gate = this.backend.nextListGate;
    if (gate) {
      this.backend.nextListGate = undefined;
      gate.entered();
      await gate.wait;
    }
    return {
      sessions: [...this.backend.sessions.values()]
        .filter((session) => session.houseId === houseId)
        .map(clone),
      items: [...this.backend.items.values()].filter((item) => item.houseId === houseId).map(clone),
    };
  }

  async applySession(session: PersistedPurchaseSession) {
    const id = session.syncId ?? session.id;
    const current = this.backend.sessions.get(id);
    if (current?.purchasedById !== undefined && current.purchasedById !== this.userId) {
      throw new Error('purchase_owner_required');
    }
    const remote = { ...clone(session), id, syncId: id, purchasedById: this.userId };
    if (
      !current ||
      (remote.updatedAt ?? remote.startedAt) > (current.updatedAt ?? current.startedAt)
    ) {
      this.backend.sessions.set(id, remote);
    }
    const result = clone(this.backend.sessions.get(id)!);
    this.backend.applied.push({ type: 'purchase-session', id, status: result.status });
    this.backend.emit('purchase-session', result);
    return result;
  }

  async applyItem(item: PurchaseItem, remoteSessionId: string) {
    const session = this.backend.sessions.get(remoteSessionId);
    if (!session || session.purchasedById !== this.userId || session.status !== 'active') {
      throw new Error('active_purchase_owner_required');
    }
    const id = item.syncId ?? item.id;
    if (this.backend.failItemOnce.delete(id)) throw new Error('temporary_item_failure');
    const remote = {
      ...clone(item),
      id,
      syncId: id,
      purchaseSessionId: remoteSessionId,
      purchasedById: this.userId,
    };
    const current = this.backend.items.get(id);
    if (
      !current ||
      (remote.updatedAt ?? remote.purchasedAt) >= (current.updatedAt ?? current.purchasedAt)
    ) {
      this.backend.items.set(id, remote);
    }
    const result = clone(this.backend.items.get(id)!);
    this.backend.applied.push({ type: 'purchase-item', id });
    this.backend.emit('purchase-item', result);
    return result;
  }

  subscribe(
    houseId: string,
    receive: (type: PurchaseSyncEntityType, entity: RemotePurchaseEntity) => void,
  ) {
    const listeners = this.backend.listeners.get(houseId) ?? new Set();
    listeners.add(receive);
    this.backend.listeners.set(houseId, listeners);
    return () => listeners.delete(receive);
  }
}

function services(label: string, backend: RemoteBackend, userId: string, runtime: Runtime) {
  const database = new CasaeLocalDatabase(`purchase-sync-${label}-${Math.random()}`, {
    migrateLegacy: false,
  });
  const repository = new OfflineFirstPurchaseRepository(
    database,
    new Remote(backend, userId),
    userId,
    runtime,
  );
  return { database, repository, service: new PurchaseService(repository, undefined, userId) };
}

function completedSession(
  id: string,
  purchasedById: string,
  storeNameSnapshot: string,
  completedAt: string,
): PersistedPurchaseSession {
  return {
    id,
    syncId: id,
    houseId: HOUSE,
    storeNameSnapshot,
    entryMode: 'quick',
    status: 'completed',
    startedAt: completedAt,
    completedAt,
    purchasedById,
    purchasedByNameSnapshot: purchasedById,
    totalPriceCents: 0,
    updatedAt: completedAt,
  };
}

function remoteItem(
  id: string,
  purchaseSessionId: string,
  purchasedById: string,
  totalPriceCents: number,
  purchasedAt: string,
): PurchaseItem {
  return {
    id,
    syncId: id,
    houseId: HOUSE,
    purchaseSessionId,
    origin: 'manual',
    productNameSnapshot: id,
    brandSnapshot: '',
    categorySnapshot: 'outros',
    prioritySnapshot: 'normal',
    notesSnapshot: '',
    plannedQuantity: 1,
    purchasedQuantity: 1,
    unitSnapshot: 'unidade',
    unitPriceCents: totalPriceCents,
    totalPriceCents,
    storeNameSnapshot: 'Mercado',
    purchasedById,
    purchasedByNameSnapshot: purchasedById,
    purchasedAt,
    createdAt: purchasedAt,
    updatedAt: purchasedAt,
  };
}

describe('OfflineFirstPurchaseRepository', () => {
  it('mantém compra e item imediatamente offline, restaura e envia a outbox ao reconectar', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const backend = new RemoteBackend();
    const first = services('offline', backend, USER_A, runtime);
    const session = await first.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Mercado offline' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Janifer' },
    );
    await first.service.addManualItem(
      {
        productName: 'Arroz',
        quantity: 2,
        unit: 'pacote',
        unitPriceCents: 875,
      },
      HOUSE,
      session.id,
    );

    expect(await first.repository.getStatus(HOUSE)).toMatchObject({ state: 'offline', pending: 2 });
    expect((await first.service.getSession(session.id, HOUSE))?.totalPriceCents).toBe(1750);
    expect(backend.sessions.size).toBe(0);

    const restoredRepository = new OfflineFirstPurchaseRepository(
      new CasaeLocalDatabase(first.database.name, { migrateLegacy: false }),
      new Remote(backend, USER_A),
      USER_A,
      runtime,
    );
    expect((await restoredRepository.getSession(HOUSE, session.id))?.items).toHaveLength(1);

    runtime.reconnect();
    await restoredRepository.syncNow(HOUSE);
    expect(await restoredRepository.getStatus(HOUSE)).toMatchObject({
      state: 'synced',
      pending: 0,
    });
    expect(backend.sessions.size).toBe(1);
    expect(backend.items.size).toBe(1);
  });

  it('finaliza totalmente offline e publica sessão, itens e histórico uma única vez ao reconectar', async () => {
    const backend = new RemoteBackend();
    const ownerRuntime = new Runtime();
    ownerRuntime.online = false;
    const owner = services('complete-offline', backend, USER_A, ownerRuntime);
    const watcher = services('complete-watcher', backend, USER_B, new Runtime());
    const unsubscribe = watcher.repository.subscribe(HOUSE, () => undefined);
    const session = await owner.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Mercado offline' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Janifer' },
    );
    await owner.service.addManualItem(
      { productName: 'Arroz', quantity: 2, unit: 'pacote', unitPriceCents: 875 },
      HOUSE,
      session.id,
    );
    await owner.service.completePurchase(HOUSE, session.id);

    expect(await owner.service.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({ id: session.id, totalPriceCents: 1750, status: 'completed' }),
    ]);
    expect(backend.sessions.size).toBe(0);

    ownerRuntime.reconnect();
    await owner.repository.syncNow(HOUSE);
    await vi.waitFor(async () => {
      expect(await watcher.service.listCompletedSessions(HOUSE)).toEqual([
        expect.objectContaining({ totalPriceCents: 1750, status: 'completed' }),
      ]);
    });
    await owner.repository.syncNow(HOUSE);
    expect(backend.sessions.size).toBe(1);
    expect(backend.items.size).toBe(1);
    unsubscribe();
  });

  it('autorrepara sessão remota concluída antes do último item e converge fingerprints sem reset', async () => {
    const backend = new RemoteBackend();
    const ownerRuntime = new Runtime();
    ownerRuntime.online = false;
    const owner = services('repair-premature-completion', backend, USER_A, ownerRuntime);
    const session = await owner.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Extra' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Ronnan' },
    );
    await owner.service.addManualItem(
      { productName: 'Item de 500', quantity: 1, unit: 'unidade', unitPriceCents: 50_000 },
      HOUSE,
      session.id,
    );
    await owner.service.addManualItem(
      { productName: 'Item de 100', quantity: 1, unit: 'unidade', unitPriceCents: 10_000 },
      HOUSE,
      session.id,
    );
    const completed = await owner.service.completePurchase(HOUSE, session.id);
    const remoteSessionId = completed.syncId ?? completed.id;
    const [firstItem] = completed.items;

    backend.sessions.set(remoteSessionId, {
      ...completed,
      items: undefined,
      id: remoteSessionId,
      syncId: remoteSessionId,
      totalPriceCents: 0,
    } as PersistedPurchaseSession);
    backend.items.set(firstItem!.syncId ?? firstItem!.id, {
      ...firstItem!,
      id: firstItem!.syncId ?? firstItem!.id,
      syncId: firstItem!.syncId ?? firstItem!.id,
      purchaseSessionId: remoteSessionId,
    });
    for (const [entryId, entry] of owner.database.getMemoryDatabase().syncOutbox) {
      if (entry.entityType === 'purchase-session') {
        owner.database.getMemoryDatabase().syncOutbox.delete(entryId);
      }
    }

    const watcher = services('repair-premature-watcher', backend, USER_B, new Runtime());
    const unsubscribe = watcher.repository.subscribe(HOUSE, () => undefined);
    ownerRuntime.online = true;
    await owner.repository.syncNow(HOUSE);

    await vi.waitFor(async () => {
      expect(await watcher.service.listCompletedSessions(HOUSE)).toEqual([
        expect.objectContaining({ status: 'completed', totalPriceCents: 60_000 }),
      ]);
    });
    const ownerCanonical = (await owner.service.listCompletedSessions(HOUSE))[0]!;
    const watcherCanonical = (await watcher.service.listCompletedSessions(HOUSE))[0]!;
    const remoteCanonical = {
      ...backend.sessions.get(remoteSessionId)!,
      totalPriceCents: 60_000,
      items: [...backend.items.values()].filter(
        (item) => item.purchaseSessionId === remoteSessionId && !item.deletedAt,
      ),
    };
    expect(backend.items.size).toBe(2);
    expect(purchaseSessionFingerprint(ownerCanonical)).toBe(
      purchaseSessionFingerprint(watcherCanonical),
    );
    expect(purchaseSessionFingerprint(ownerCanonical)).toBe(
      purchaseSessionFingerprint(remoteCanonical),
    );

    const reloaded = services('repair-premature-reload', backend, USER_B, new Runtime());
    await reloaded.repository.syncNow(HOUSE);
    expect(
      purchaseSessionFingerprint((await reloaded.service.listCompletedSessions(HOUSE))[0]!),
    ).toBe(purchaseSessionFingerprint(remoteCanonical));
    unsubscribe();
  });

  it('mantém a sessão remota ativa quando o segundo item falha e só conclui após o retry', async () => {
    const backend = new RemoteBackend();
    const runtime = new Runtime();
    runtime.online = false;
    const owner = services('item-retry-barrier', backend, USER_A, runtime);
    const session = await owner.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Mercado retry' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Ronnan' },
    );
    const firstItem = owner.service.addManualItem(
      { productName: 'Primeiro', quantity: 1, unit: 'unidade', unitPriceCents: 500 },
      HOUSE,
      session.id,
    );
    const secondItem = owner.service.addManualItem(
      { productName: 'Segundo', quantity: 1, unit: 'unidade', unitPriceCents: 100 },
      HOUSE,
      session.id,
    );
    await Promise.all([firstItem, secondItem]);
    const completed = await owner.service.completePurchase(HOUSE, session.id);
    expect(await owner.repository.getStatus(HOUSE)).toMatchObject({ state: 'offline', pending: 3 });
    const secondRemoteId = completed.items[1]!.syncId ?? completed.items[1]!.id;
    backend.failItemOnce.add(secondRemoteId);

    runtime.online = true;
    await owner.repository.syncNow(HOUSE);
    expect(backend.items.size).toBe(1);
    expect([...backend.sessions.values()][0]).toMatchObject({ status: 'active' });
    expect(backend.applied).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'completed' })]),
    );

    runtime.advance(3_000);
    await owner.repository.syncNow(HOUSE);
    expect(backend.items.size).toBe(2);
    expect([...backend.sessions.values()][0]).toMatchObject({ status: 'completed' });
    const secondItemIndex = backend.applied.findIndex(
      (entry) => entry.type === 'purchase-item' && entry.id === secondRemoteId,
    );
    const completionIndex = backend.applied.findIndex((entry) => entry.status === 'completed');
    expect(secondItemIndex).toBeGreaterThanOrEqual(0);
    expect(completionIndex).toBeGreaterThan(secondItemIndex);
  });

  it('marca pull concorrente como dirty e executa uma nova rodada completa', async () => {
    const backend = new RemoteBackend();
    const device = services('dirty-pull', backend, USER_A, new Runtime());
    const realtimeSession = completedSession(
      '94000000-0000-4000-8000-000000000001',
      USER_A,
      'Realtime durante pull',
      '2026-08-26T11:00:00.000Z',
    );
    backend.sessions.set(realtimeSession.id, realtimeSession);
    let releaseList!: () => void;
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => (markEntered = resolve));
    backend.nextListGate = {
      entered: markEntered,
      wait: new Promise<void>((resolve) => (releaseList = resolve)),
    };

    const unsubscribe = device.repository.subscribe(HOUSE, () => undefined);
    await entered;
    backend.emit('purchase-session', realtimeSession);
    releaseList();

    await vi.waitFor(() => expect(backend.listCalls).toBe(6));
    unsubscribe();
  });

  it('só importa compras antigas após confirmação e mantém IDs e snapshots sem duplicar', async () => {
    const backend = new RemoteBackend();
    const runtime = new Runtime();
    const device = services('legacy', backend, USER_A, runtime);
    const local = new LocalPurchaseRepository(device.database);
    const completedAt = '2026-07-20T18:00:00.000Z';
    await local.putPersistedSession({
      id: 'legacy-session',
      houseId: LEGACY_HOUSE_ID,
      storeNameSnapshot: 'Mercado antigo',
      status: 'completed',
      startedAt: completedAt,
      completedAt,
      purchasedByNameSnapshot: 'Janifer antiga',
      totalPriceCents: 1200,
      updatedAt: completedAt,
    });
    await local.putPersistedItem({
      id: 'legacy-item',
      houseId: LEGACY_HOUSE_ID,
      purchaseSessionId: 'legacy-session',
      productNameSnapshot: 'Produto antigo',
      brandSnapshot: '',
      categorySnapshot: 'outros',
      prioritySnapshot: 'normal',
      notesSnapshot: '',
      plannedQuantity: 1,
      purchasedQuantity: 1,
      unitSnapshot: 'unidade',
      unitPriceCents: 1200,
      totalPriceCents: 1200,
      storeNameSnapshot: 'Mercado antigo',
      purchasedByNameSnapshot: 'Janifer antiga',
      purchasedAt: completedAt,
      updatedAt: completedAt,
    });

    const migration = await device.repository.getLegacyMigration(HOUSE);
    expect(migration).toMatchObject({ sessions: 1, items: 1 });
    expect(backend.sessions.size).toBe(0);
    await migration!.importIntoHouse();
    await device.repository.syncNow(HOUSE);
    expect(await device.service.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        legacyId: 'legacy-session',
        storeNameSnapshot: 'Mercado antigo',
        purchasedByNameSnapshot: 'Janifer antiga',
      }),
    ]);
    expect(backend.sessions.size).toBe(1);
    expect(backend.items.size).toBe(1);
    expect(await device.repository.getLegacyMigration(HOUSE)).toBeNull();
    await migration!.importIntoHouse();
    expect(backend.sessions.size).toBe(1);
    expect(backend.items.size).toBe(1);
  });

  it('propaga Realtime ao acompanhante, mantém edição exclusiva e preserva a compra concluída', async () => {
    const backend = new RemoteBackend();
    const ownerRuntime = new Runtime();
    const watcherRuntime = new Runtime();
    const owner = services('owner', backend, USER_A, ownerRuntime);
    const watcher = services('watcher', backend, USER_B, watcherRuntime);
    const unsubscribe = watcher.repository.subscribe(HOUSE, () => undefined);

    const session = await owner.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Atacadão' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Janifer' },
    );
    await owner.repository.syncNow(HOUSE);
    await owner.service.addManualItem(
      {
        productName: 'Leite',
        quantity: 3,
        unit: 'caixa',
        unitPriceCents: 499,
      },
      HOUSE,
      session.id,
    );
    await owner.repository.syncNow(HOUSE);

    await vi.waitFor(async () => {
      expect((await watcher.service.getSession(session.id, HOUSE))?.items).toHaveLength(1);
    });
    const originalItem = (await owner.service.getSession(session.id, HOUSE))!.items[0]!;
    await owner.service.updateManualItem(
      originalItem.id,
      {
        productName: 'Leite',
        quantity: 2,
        unit: 'caixa',
        unitPriceCents: 550,
      },
      HOUSE,
      session.id,
    );
    await owner.repository.syncNow(HOUSE);
    await vi.waitFor(async () => {
      expect((await watcher.service.getSession(session.id, HOUSE))?.totalPriceCents).toBe(1100);
    });
    await owner.service.removePurchaseItem(originalItem.id, HOUSE, session.id);
    await owner.repository.syncNow(HOUSE);
    await vi.waitFor(async () => {
      expect((await watcher.service.getSession(session.id, HOUSE))?.items).toHaveLength(0);
    });
    await expect(
      watcher.service.addManualItem(
        { productName: 'Intruso', quantity: 1, unit: 'unidade', unitPriceCents: 100 },
        HOUSE,
        session.id,
      ),
    ).rejects.toThrow(/somente quem iniciou/i);

    await owner.service.addManualItem(
      { productName: 'Café', quantity: 1, unit: 'pacote', unitPriceCents: 1000 },
      HOUSE,
      session.id,
    );
    await owner.repository.syncNow(HOUSE);

    await owner.service.completePurchase(HOUSE, session.id);
    await owner.repository.syncNow(HOUSE);
    await vi.waitFor(async () => {
      expect(await watcher.service.listActiveSessions(HOUSE)).toHaveLength(0);
      expect(await watcher.service.getSession(session.id, HOUSE)).toMatchObject({
        status: 'completed',
        totalPriceCents: 1000,
      });
    });
    expect(backend.items.size).toBe(2);
    unsubscribe();
  });

  it('não deixa a outbox de outra conta bloquear o pull de uma compra concluída', async () => {
    const backend = new RemoteBackend();
    const runtime = new Runtime();
    runtime.online = false;
    const database = new CasaeLocalDatabase(`purchase-shared-account-${Math.random()}`, {
      migrateLegacy: false,
    });
    const ownerRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_A),
      USER_A,
      runtime,
    );
    const ownerService = new PurchaseService(ownerRepository, undefined, USER_A);
    const session = await ownerService.startPurchase(
      { id: crypto.randomUUID(), name: 'Mercado compartilhado' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Owner A' },
    );
    const remoteId = session.syncId ?? session.id;
    backend.sessions.set(remoteId, {
      ...session,
      id: remoteId,
      syncId: remoteId,
      status: 'completed',
      completedAt: '2026-08-26T13:00:00.000Z',
      updatedAt: '2026-08-26T13:00:00.000Z',
    });
    backend.items.set('00000000-0000-4000-8000-000000000099', {
      id: '00000000-0000-4000-8000-000000000099',
      syncId: '00000000-0000-4000-8000-000000000099',
      houseId: HOUSE,
      purchaseSessionId: remoteId,
      origin: 'manual',
      productNameSnapshot: 'Arroz',
      brandSnapshot: '',
      categorySnapshot: 'mercearia',
      prioritySnapshot: 'normal',
      notesSnapshot: '',
      plannedQuantity: 1,
      purchasedQuantity: 1,
      unitSnapshot: 'pacote',
      unitPriceCents: 1_000,
      totalPriceCents: 1_000,
      storeNameSnapshot: 'Mercado compartilhado',
      purchasedById: USER_A,
      purchasedByNameSnapshot: 'Owner A',
      purchasedAt: '2026-08-26T12:30:00.000Z',
      createdAt: '2026-08-26T12:30:00.000Z',
      updatedAt: '2026-08-26T12:30:00.000Z',
    });

    runtime.online = true;
    const memberRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_B),
      USER_B,
      runtime,
    );
    const memberService = new PurchaseService(memberRepository, undefined, USER_B);
    await memberRepository.syncNow(HOUSE);

    expect(await memberService.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({
        id: session.id,
        purchasedById: USER_A,
        status: 'completed',
        totalPriceCents: 1_000,
      }),
    ]);
    expect(await memberRepository.getStatus(HOUSE)).toMatchObject({ state: 'synced', pending: 0 });
    expect(
      [...database.getMemoryDatabase().syncOutbox.values()].some(
        (entry) => entry.actorId === USER_A,
      ),
    ).toBe(true);
  });

  it('reconcilia dois IndexedDBs divergentes pelo UUID remoto e corrige item ligado à sessão errada', async () => {
    const backend = new RemoteBackend();
    const sessionIds = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ];
    const itemIds = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003',
    ];
    const users = [USER_A, USER_B, USER_C];
    sessionIds.forEach((id, index) =>
      backend.sessions.set(
        id,
        completedSession(id, users[index]!, `Mercado ${index + 1}`, `2026-08-26T1${index}:00:00Z`),
      ),
    );
    itemIds.forEach((id, index) =>
      backend.items.set(
        id,
        remoteItem(
          id,
          sessionIds[index]!,
          users[index]!,
          (index + 1) * 1_000,
          `2026-08-26T1${index}:05:00Z`,
        ),
      ),
    );

    const first = services('reconcile-owner', backend, USER_A, new Runtime());
    const second = services('reconcile-member', backend, USER_B, new Runtime());
    const firstLocal = new LocalPurchaseRepository(first.database);
    const secondLocal = new LocalPurchaseRepository(second.database);
    const sharedLegacyId = 'legacy-session-same-on-both-devices';
    await firstLocal.putPersistedSession({
      ...backend.sessions.get(sessionIds[0]!)!,
      id: sharedLegacyId,
      syncId: sessionIds[0],
    });
    await firstLocal.putPersistedItem({
      ...backend.items.get(itemIds[0]!)!,
      id: 'local-item-owner',
      syncId: itemIds[0],
      purchaseSessionId: sharedLegacyId,
    });
    await firstLocal.putPersistedSession({
      ...completedSession(
        '30000000-0000-4000-8000-000000000001',
        USER_A,
        'Ghost owner',
        '2026-08-26T14:00:00Z',
      ),
      id: 'ghost-owner',
      syncId: '30000000-0000-4000-8000-000000000001',
    });

    await secondLocal.putPersistedSession({
      ...backend.sessions.get(sessionIds[1]!)!,
      id: sharedLegacyId,
      syncId: sessionIds[1],
    });
    await secondLocal.putPersistedItem({
      ...backend.items.get(itemIds[2]!)!,
      id: 'misbound-third-item',
      syncId: itemIds[2],
      purchaseSessionId: sharedLegacyId,
    });
    await secondLocal.putPersistedItem({
      ...remoteItem(
        '40000000-0000-4000-8000-000000000001',
        sharedLegacyId,
        USER_B,
        10_000,
        '2026-08-26T15:00:00Z',
      ),
      id: 'ghost-item-causing-wrong-total',
      syncId: '40000000-0000-4000-8000-000000000001',
    });

    expect((await second.service.listCompletedSessions(HOUSE))[0]?.totalPriceCents).toBe(13_000);
    await Promise.all([first.repository.syncNow(HOUSE), second.repository.syncNow(HOUSE)]);

    const snapshots = await Promise.all([
      first.service.listCompletedSessions(HOUSE),
      second.service.listCompletedSessions(HOUSE),
    ]);
    const summarize = (sessions: Awaited<ReturnType<PurchaseService['listCompletedSessions']>>) =>
      sessions
        .map((session) => ({
          id: session.id,
          itemIds: session.items.map((item) => item.id).sort(),
          total: session.totalPriceCents,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
    expect(summarize(snapshots[0])).toEqual(summarize(snapshots[1]));
    expect(summarize(snapshots[0])).toEqual([
      { id: sessionIds[0], itemIds: [itemIds[0]], total: 1_000 },
      { id: sessionIds[1], itemIds: [itemIds[1]], total: 2_000 },
      { id: sessionIds[2], itemIds: [itemIds[2]], total: 3_000 },
    ]);
    expect(snapshots[0].flatMap((session) => session.items)).toHaveLength(3);
    expect(snapshots[1].flatMap((session) => session.items)).toHaveLength(3);
    expect(snapshots[0].reduce((sum, session) => sum + session.totalPriceCents, 0)).toBe(6_000);
    expect(snapshots[1].reduce((sum, session) => sum + session.totalPriceCents, 0)).toBe(6_000);
    expect(
      snapshots[1].find((session) => session.id === sessionIds[2])?.items[0]?.purchaseSessionId,
    ).toBe(sessionIds[2]);
  });

  it('preserva legacy sem syncId fisicamente e o exclui do histórico compartilhado', async () => {
    const backend = new RemoteBackend();
    const sessionId = '50000000-0000-4000-8000-000000000001';
    const itemId = '60000000-0000-4000-8000-000000000001';
    backend.sessions.set(
      sessionId,
      completedSession(sessionId, USER_A, 'Mercado remoto', '2026-08-26T10:00:00Z'),
    );
    backend.items.set(itemId, remoteItem(itemId, sessionId, USER_A, 1_000, '2026-08-26T10:05:00Z'));
    const device = services('preserve-legacy', backend, USER_A, new Runtime());
    const local = new LocalPurchaseRepository(device.database);
    await local.putPersistedSession({
      ...completedSession('legacy-only', USER_A, 'Mercado antigo', '2026-07-01T10:00:00Z'),
      id: 'legacy-only',
      syncId: undefined,
    });
    await local.putPersistedItem({
      ...remoteItem('legacy-item-only', 'legacy-only', USER_A, 500, '2026-07-01T10:05:00Z'),
      id: 'legacy-item-only',
      syncId: undefined,
    });

    await device.repository.syncNow(HOUSE);
    expect(await device.service.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({ id: sessionId, totalPriceCents: 1_000 }),
    ]);
    expect(await local.listPersistedSessions(HOUSE)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'legacy-only', syncId: undefined })]),
    );
    expect(await local.listPersistedItems(HOUSE)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-item-only',
          purchaseSessionId: 'legacy-only',
          syncId: undefined,
        }),
      ]),
    );
  });

  it('isola login alternado no mesmo IndexedDB e restaura somente o pending do actor atual', async () => {
    const backend = new RemoteBackend();
    const runtime = new Runtime();
    runtime.online = false;
    const database = new CasaeLocalDatabase(`purchase-login-switch-${Math.random()}`, {
      migrateLegacy: false,
    });
    const ownerRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_A),
      USER_A,
      runtime,
    );
    const ownerService = new PurchaseService(ownerRepository, undefined, USER_A);
    const pendingSession = await ownerService.startPurchase(
      { id: crypto.randomUUID(), name: 'Compra offline do owner' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Owner A' },
    );
    await ownerService.addManualItem(
      { productName: 'Pending legítimo', quantity: 1, unit: 'unidade', unitPriceCents: 700 },
      HOUSE,
      pendingSession.id,
    );

    const remoteSessionId = '70000000-0000-4000-8000-000000000001';
    const remoteItemId = '80000000-0000-4000-8000-000000000001';
    backend.sessions.set(
      remoteSessionId,
      completedSession(remoteSessionId, USER_B, 'Compra remota', '2026-08-26T10:00:00Z'),
    );
    backend.items.set(
      remoteItemId,
      remoteItem(remoteItemId, remoteSessionId, USER_B, 1_000, '2026-08-26T10:05:00Z'),
    );

    runtime.online = true;
    const memberRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_B),
      USER_B,
      runtime,
    );
    const memberService = new PurchaseService(memberRepository, undefined, USER_B);
    await memberRepository.syncNow(HOUSE);
    expect(await memberService.listActiveSessions(HOUSE)).toHaveLength(0);
    expect(await memberService.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({ id: remoteSessionId, totalPriceCents: 1_000 }),
    ]);
    expect(
      [...database.getMemoryDatabase().syncOutbox.values()].every((entry) =>
        entry.id.includes(entry.actorId),
      ),
    ).toBe(true);

    const restoredOwnerRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_A),
      USER_A,
      runtime,
    );
    await restoredOwnerRepository.syncNow(HOUSE);
    expect(await restoredOwnerRepository.listActiveSessions(HOUSE)).toEqual([
      expect.objectContaining({ purchasedById: USER_A, totalPriceCents: 700 }),
    ]);
    expect(backend.sessions.has(pendingSession.syncId ?? pendingSession.id)).toBe(true);
    expect(backend.items.size).toBe(2);

    const restoredMemberRepository = new OfflineFirstPurchaseRepository(
      database,
      new Remote(backend, USER_B),
      USER_B,
      runtime,
    );
    await restoredMemberRepository.syncNow(HOUSE);
    expect(await restoredMemberRepository.listCompletedSessions(HOUSE)).toEqual([
      expect.objectContaining({ id: remoteSessionId, totalPriceCents: 1_000 }),
    ]);
    expect(await restoredMemberRepository.listActiveSessions(HOUSE)).toEqual([
      expect.objectContaining({ purchasedById: USER_A, totalPriceCents: 700 }),
    ]);
  });

  it('autorrepara um IndexedDB antigo divergente no primeiro pull sem reset', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('IDBKeyRange', FakeIDBKeyRange);
    try {
      const backend = new RemoteBackend();
      const remoteSessionIds = [
        '90000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000002',
      ];
      const remoteItemIds = [
        '91000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000002',
      ];
      remoteSessionIds.forEach((id, index) =>
        backend.sessions.set(
          id,
          completedSession(
            id,
            [USER_A, USER_B][index]!,
            `Remoto ${index + 1}`,
            `2026-08-27T0${index + 8}:00:00Z`,
          ),
        ),
      );
      remoteItemIds.forEach((id, index) =>
        backend.items.set(
          id,
          remoteItem(
            id,
            remoteSessionIds[index]!,
            [USER_A, USER_B][index]!,
            (index + 1) * 1_000,
            `2026-08-27T0${index + 8}:05:00Z`,
          ),
        ),
      );

      const name = `purchase-old-upgrade-${Math.random()}`;
      const oldDatabase = new CasaeLocalDatabase(name, { migrateLegacy: false });
      const oldLocal = new LocalPurchaseRepository(oldDatabase);
      await oldLocal.putPersistedSession({
        ...backend.sessions.get(remoteSessionIds[0]!)!,
        id: 'old-local-session-id',
        syncId: remoteSessionIds[0],
      });
      await oldLocal.putPersistedItem({
        ...backend.items.get(remoteItemIds[1]!)!,
        id: 'old-item-bound-to-wrong-session',
        syncId: remoteItemIds[1],
        purchaseSessionId: 'old-local-session-id',
      });
      await oldLocal.putPersistedSession({
        ...completedSession(
          '92000000-0000-4000-8000-000000000001',
          USER_A,
          'Ghost sincronizado',
          '2026-08-27T10:00:00Z',
        ),
        id: 'old-ghost-session',
        syncId: '92000000-0000-4000-8000-000000000001',
      });
      await oldLocal.putPersistedItem({
        ...remoteItem(
          '93000000-0000-4000-8000-000000000001',
          'old-ghost-session',
          USER_A,
          10_000,
          '2026-08-27T10:05:00Z',
        ),
        id: 'old-ghost-item',
        syncId: '93000000-0000-4000-8000-000000000001',
      });
      await oldLocal.putPersistedSession({
        ...completedSession('legacy-not-imported', USER_A, 'Legacy', '2026-07-01T10:00:00Z'),
        id: 'legacy-not-imported',
        syncId: undefined,
      });
      await oldLocal.putPersistedItem({
        ...remoteItem(
          'legacy-item-not-imported',
          'legacy-not-imported',
          USER_A,
          500,
          '2026-07-01T10:05:00Z',
        ),
        id: 'legacy-item-not-imported',
        syncId: undefined,
      });
      const native = await oldDatabase.getNativeDatabase();
      const metadataTransaction = native!.transaction(CASAE_STORES.metadata, 'readwrite');
      metadataTransaction.objectStore(CASAE_STORES.metadata).put({
        key: `purchase-history-imported:${HOUSE}`,
        value: true,
        completedAt: '2026-08-26T00:00:00Z',
      });
      await transactionToPromise(metadataTransaction);
      native!.close();

      const upgradedDatabase = new CasaeLocalDatabase(name, { migrateLegacy: false });
      const upgradedRepository = new OfflineFirstPurchaseRepository(
        upgradedDatabase,
        new Remote(backend, USER_A),
        USER_A,
        new Runtime(),
      );
      const upgradedService = new PurchaseService(upgradedRepository, undefined, USER_A);
      await upgradedRepository.syncNow(HOUSE);

      expect(await upgradedService.listCompletedSessions(HOUSE)).toEqual([
        expect.objectContaining({ id: remoteSessionIds[1], totalPriceCents: 2_000 }),
        expect.objectContaining({ id: remoteSessionIds[0], totalPriceCents: 1_000 }),
      ]);
      const repaired = await upgradedService.listCompletedSessions(HOUSE);
      expect(repaired.flatMap((session) => session.items)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: remoteItemIds[0],
            purchaseSessionId: remoteSessionIds[0],
          }),
          expect.objectContaining({
            id: remoteItemIds[1],
            purchaseSessionId: remoteSessionIds[1],
          }),
        ]),
      );
      expect(repaired.reduce((sum, session) => sum + session.totalPriceCents, 0)).toBe(3_000);

      const rawLocal = new LocalPurchaseRepository(upgradedDatabase);
      expect(await rawLocal.listPersistedSessions(HOUSE)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'legacy-not-imported', syncId: undefined }),
          expect.objectContaining({ id: remoteSessionIds[0], syncId: remoteSessionIds[0] }),
          expect.objectContaining({ id: remoteSessionIds[1], syncId: remoteSessionIds[1] }),
        ]),
      );
      expect(await rawLocal.listPersistedSessions(HOUSE)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'old-ghost-session' })]),
      );
      expect(await upgradedRepository.getLegacyMigration(HOUSE)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mantém a matriz owner/member/member simétrica por Realtime e pull', async () => {
    const backend = new RemoteBackend();
    const clients = [
      services('matrix-owner-a', backend, USER_A, new Runtime()),
      services('matrix-member-b', backend, USER_B, new Runtime()),
      services('matrix-member-c', backend, USER_C, new Runtime()),
    ];
    const names = ['Owner A', 'Member B', 'Member C'];
    const unsubscribes = clients.map((client) =>
      client.repository.subscribe(HOUSE, () => undefined),
    );

    for (const [index, client] of clients.entries()) {
      const session = await client.service.startPurchase(
        { id: crypto.randomUUID(), name: `Mercado ${index + 1}` },
        'quick',
        {
          houseId: HOUSE,
          memberId: [USER_A, USER_B, USER_C][index]!,
          memberName: names[index]!,
        },
      );
      await client.repository.syncNow(HOUSE);
      await client.service.addManualItem(
        {
          productName: `Produto ${index + 1}`,
          quantity: 1,
          unit: 'unidade',
          unitPriceCents: (index + 1) * 100,
        },
        HOUSE,
        session.id,
      );
      await client.repository.syncNow(HOUSE);
      await client.service.completePurchase(HOUSE, session.id);
      await client.repository.syncNow(HOUSE);
    }

    await Promise.all(clients.map((client) => client.repository.syncNow(HOUSE)));
    for (const client of clients) {
      expect(
        new Set(
          (await client.service.listCompletedSessions(HOUSE)).map(
            (session) => session.purchasedById,
          ),
        ),
      ).toEqual(new Set([USER_A, USER_B, USER_C]));
    }
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  it('sincroniza cancelamento como estado persistente, sem apagar a sessão', async () => {
    const backend = new RemoteBackend();
    const owner = services('cancel-owner', backend, USER_A, new Runtime());
    const watcher = services('cancel-watcher', backend, USER_B, new Runtime());
    const unsubscribe = watcher.repository.subscribe(HOUSE, () => undefined);
    const session = await owner.service.startPurchase(
      { id: crypto.randomUUID(), name: 'Mercado cancelado' },
      'quick',
      { houseId: HOUSE, memberId: USER_A, memberName: 'Janifer' },
    );
    await owner.repository.syncNow(HOUSE);
    await owner.service.cancelPurchase(HOUSE, session.id);
    await owner.repository.syncNow(HOUSE);

    await vi.waitFor(async () => {
      expect(await watcher.service.listActiveSessions(HOUSE)).toHaveLength(0);
      expect(await watcher.service.getSession(session.id, HOUSE)).toMatchObject({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      });
    });
    expect(backend.sessions.size).toBe(1);
    unsubscribe();
  });

  it('permite compras simultâneas independentes na mesma Casa', async () => {
    const backend = new RemoteBackend();
    const first = services('simultaneous-a', backend, USER_A, new Runtime());
    const second = services('simultaneous-b', backend, USER_B, new Runtime());
    await first.service.startPurchase({ id: crypto.randomUUID(), name: 'Mercado A' }, 'list', {
      houseId: HOUSE,
      memberId: USER_A,
      memberName: 'Janifer',
    });
    await second.service.startPurchase({ id: crypto.randomUUID(), name: 'Mercado B' }, 'quick', {
      houseId: HOUSE,
      memberId: USER_B,
      memberName: 'Ronnan',
    });
    await Promise.all([first.repository.syncNow(HOUSE), second.repository.syncNow(HOUSE)]);
    await first.repository.syncNow(HOUSE);
    expect(await first.service.listActiveSessions(HOUSE)).toHaveLength(2);
    expect(
      new Set((await first.service.listActiveSessions(HOUSE)).map((item) => item.purchasedById)),
    ).toEqual(new Set([USER_A, USER_B]));
  });
});
