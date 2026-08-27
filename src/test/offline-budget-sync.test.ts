import { describe, expect, it, vi } from 'vitest';
import { BudgetService } from '../application/budget-service';
import type { HouseBudget } from '../domain/budget';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { OfflineFirstBudgetRepository } from '../infrastructure/budget/OfflineFirstBudgetRepository';
import type { ShoppingSyncRuntime } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import type { RemoteBudgetStore } from '../infrastructure/supabase/SupabaseBudgetRepository';

const HOUSE_A = 'a0000000-0000-4000-8000-000000000001';
const HOUSE_B = 'b0000000-0000-4000-8000-000000000002';
const USER_A = '10000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const USER_C = '30000000-0000-4000-8000-000000000003';
const clone = <T>(value: T): T => structuredClone(value);

class Runtime implements ShoppingSyncRuntime {
  online = true;
  current = new Date('2026-08-26T12:00:00.000Z');
  onlineListeners = new Set<() => void>();
  isOnline = () => this.online;
  now = () => new Date(this.current);
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
}

class BudgetBackend {
  values = new Map<string, HouseBudget>();
  listeners = new Map<string, Set<(budget: HouseBudget) => void>>();
}

class Remote implements RemoteBudgetStore {
  constructor(
    private readonly backend: BudgetBackend,
    private readonly userId: string,
  ) {}
  async getCurrentUserId() {
    return this.userId;
  }
  async list(houseId: string) {
    return [...this.backend.values.values()]
      .filter((budget) => budget.houseId === houseId)
      .map(clone);
  }
  async apply(budget: HouseBudget) {
    const period = `${budget.houseId}:${budget.year}-${budget.month}`;
    const current = this.backend.values.get(period);
    const id = current?.id ?? budget.syncId ?? budget.id;
    const saved: HouseBudget = {
      ...clone(budget),
      id,
      syncId: id,
      createdById: current?.createdById ?? this.userId,
      updatedById: this.userId,
    };
    if (!current || saved.updatedAt > current.updatedAt) this.backend.values.set(period, saved);
    const authoritative = clone(this.backend.values.get(period)!);
    this.backend.listeners
      .get(budget.houseId)
      ?.forEach((listener) => listener(clone(authoritative)));
    return authoritative;
  }
  subscribe(houseId: string, receive: (budget: HouseBudget) => void) {
    const listeners = this.backend.listeners.get(houseId) ?? new Set();
    listeners.add(receive);
    this.backend.listeners.set(houseId, listeners);
    return () => listeners.delete(receive);
  }
}

function setup(label: string, backend: BudgetBackend, userId: string, runtime: Runtime) {
  const database = new CasaeLocalDatabase(`budget-sync-${label}-${Math.random()}`, {
    migrateLegacy: false,
  });
  const repository = new OfflineFirstBudgetRepository(
    database,
    new Remote(backend, userId),
    userId,
    runtime,
  );
  return { repository, service: new BudgetService(repository) };
}

describe('OfflineFirstBudgetRepository', () => {
  it('salva imediatamente offline e sincroniza uma única versão ao reconectar', async () => {
    const runtime = new Runtime();
    runtime.online = false;
    const backend = new BudgetBackend();
    const device = setup('offline', backend, USER_A, runtime);
    await device.service.setMonthlyBudget(2026, 8, 150_000, HOUSE_A);
    await device.service.setMonthlyBudget(2026, 8, 170_000, HOUSE_A);
    expect(await device.service.list(HOUSE_A)).toHaveLength(1);
    expect(await device.repository.getStatus(HOUSE_A)).toMatchObject({
      state: 'offline',
      pending: 1,
    });

    runtime.reconnect();
    await device.repository.syncNow(HOUSE_A);
    expect([...backend.values.values()]).toEqual([
      expect.objectContaining({ houseId: HOUSE_A, amountCents: 170_000 }),
    ]);
    expect(await device.repository.getStatus(HOUSE_A)).toMatchObject({
      state: 'synced',
      pending: 0,
    });
  });

  it('propaga criação e atualização por Realtime sem vazar entre Casas', async () => {
    const backend = new BudgetBackend();
    const first = setup('first', backend, USER_A, new Runtime());
    const second = setup('second', backend, USER_B, new Runtime());
    const changed = vi.fn();
    const unsubscribe = second.repository.subscribe(HOUSE_A, changed);

    await first.service.setMonthlyBudget(2026, 8, 150_000, HOUSE_A);
    await first.repository.syncNow(HOUSE_A);
    await vi.waitFor(async () => {
      expect(await second.service.list(HOUSE_A)).toEqual([
        expect.objectContaining({ amountCents: 150_000 }),
      ]);
    });
    await second.service.setMonthlyBudget(2026, 8, 170_000, HOUSE_A);
    await second.repository.syncNow(HOUSE_A);
    await first.repository.syncNow(HOUSE_A);
    expect(await first.service.list(HOUSE_A)).toEqual([
      expect.objectContaining({ amountCents: 170_000 }),
    ]);
    expect(await second.service.list(HOUSE_B)).toEqual([]);
    expect(changed).toHaveBeenCalled();
    unsubscribe();
  });

  it('não deixa orçamento pendente de outra conta bloquear o snapshot remoto', async () => {
    const backend = new BudgetBackend();
    const runtime = new Runtime();
    runtime.online = false;
    const database = new CasaeLocalDatabase(`budget-shared-account-${Math.random()}`, {
      migrateLegacy: false,
    });
    const ownerRepository = new OfflineFirstBudgetRepository(
      database,
      new Remote(backend, USER_A),
      USER_A,
      runtime,
    );
    const ownerService = new BudgetService(ownerRepository);
    const pending = await ownerService.setMonthlyBudget(2026, 8, 150_000, HOUSE_A);
    const remoteUpdatedAt = new Date(new Date(pending.updatedAt).getTime() - 1_000).toISOString();
    backend.values.set(`${HOUSE_A}:2026-8`, {
      ...pending,
      id: pending.syncId ?? pending.id,
      syncId: pending.syncId ?? pending.id,
      amountCents: 175_000,
      updatedAt: remoteUpdatedAt,
      updatedById: USER_C,
    });

    runtime.online = true;
    const memberRepository = new OfflineFirstBudgetRepository(
      database,
      new Remote(backend, USER_B),
      USER_B,
      runtime,
    );
    await memberRepository.syncNow(HOUSE_A);

    expect(await new BudgetService(memberRepository).list(HOUSE_A)).toEqual([
      expect.objectContaining({ amountCents: 175_000, updatedById: USER_C }),
    ]);
    expect(await memberRepository.getStatus(HOUSE_A)).toMatchObject({
      state: 'synced',
      pending: 0,
    });
  });

  it('mantém orçamento simétrico entre owner e dois members', async () => {
    const backend = new BudgetBackend();
    const clients = [
      setup('matrix-owner-a', backend, USER_A, new Runtime()),
      setup('matrix-member-b', backend, USER_B, new Runtime()),
      setup('matrix-member-c', backend, USER_C, new Runtime()),
    ];
    const unsubscribes = clients.map((client) =>
      client.repository.subscribe(HOUSE_A, () => undefined),
    );

    for (const [index, client] of clients.entries()) {
      await client.service.setMonthlyBudget(2026, 8 + index, (index + 1) * 100_000, HOUSE_A);
      await client.repository.syncNow(HOUSE_A);
    }
    await Promise.all(clients.map((client) => client.repository.syncNow(HOUSE_A)));

    for (const client of clients) {
      expect(
        (await client.service.list(HOUSE_A)).map((budget) => budget.amountCents).sort(),
      ).toEqual([100_000, 200_000, 300_000]);
    }
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  });
});
