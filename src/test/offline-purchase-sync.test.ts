import { describe, expect, it, vi } from 'vitest';
import { PurchaseService } from '../application/purchase-service';
import type { PersistedPurchaseSession, PurchaseItem } from '../domain/purchase';
import type { PurchaseSyncEntityType } from '../domain/purchase-sync';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { OfflineFirstPurchaseRepository } from '../infrastructure/purchase/OfflineFirstPurchaseRepository';
import type { ShoppingSyncRuntime } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type {
  RemotePurchaseEntity,
  RemotePurchaseSnapshot,
  RemotePurchaseStore,
} from '../infrastructure/supabase/SupabasePurchaseRepository';

const HOUSE = '00000000-0000-4000-8000-000000000001';
const USER_A = '00000000-0000-4000-8000-000000000010';
const USER_B = '00000000-0000-4000-8000-000000000020';

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
}

class RemoteBackend {
  sessions = new Map<string, PersistedPurchaseSession>();
  items = new Map<string, PurchaseItem>();
  listeners = new Map<
    string,
    Set<(type: PurchaseSyncEntityType, entity: RemotePurchaseEntity) => void>
  >();
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
      (remote.updatedAt ?? remote.startedAt) >= (current.updatedAt ?? current.startedAt)
    ) {
      this.backend.sessions.set(id, remote);
    }
    const result = clone(this.backend.sessions.get(id)!);
    this.backend.emit('purchase-session', result);
    return result;
  }

  async applyItem(item: PurchaseItem, remoteSessionId: string) {
    const session = this.backend.sessions.get(remoteSessionId);
    if (!session || session.purchasedById !== this.userId || session.status !== 'active') {
      throw new Error('active_purchase_owner_required');
    }
    const id = item.syncId ?? item.id;
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
