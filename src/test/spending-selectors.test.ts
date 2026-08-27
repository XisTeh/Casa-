import { describe, expect, it } from 'vitest';
import type { HouseBudget } from '../domain/budget';
import type { PurchaseSession } from '../domain/purchase';
import {
  buildMonthlySpendingProjection,
  getBudgetProgress,
  getCategoryBreakdown,
  getMonthlyCumulativeSeries,
  getMonthlySpending,
  getPreviousMonthComparison,
  getStoreBreakdown,
  shiftMonth,
} from '../application/spending-selectors';

function session(
  id: string,
  completedAt: string,
  totalPriceCents: number,
  options: {
    status?: 'active' | 'completed' | 'cancelled';
    storeId?: string;
    storeName?: string;
    categoryName?: string;
  } = {},
): PurchaseSession {
  return {
    id,
    houseId: 'house-raabe-sidney',
    storeId: options.storeId,
    storeNameSnapshot: options.storeName ?? 'Mercado histórico',
    status: options.status ?? 'completed',
    startedAt: completedAt,
    completedAt:
      options.status === 'active' || options.status === 'cancelled' ? undefined : completedAt,
    cancelledAt: options.status === 'cancelled' ? completedAt : undefined,
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents,
    items: [
      {
        id: `item-${id}`,
        houseId: 'house-raabe-sidney',
        purchaseSessionId: id,
        productNameSnapshot: 'Produto antigo',
        brandSnapshot: '',
        categorySnapshot: 'outros',
        categoryNameSnapshot: options.categoryName,
        prioritySnapshot: 'normal',
        notesSnapshot: '',
        plannedQuantity: 1,
        purchasedQuantity: 1,
        unitSnapshot: 'unidade',
        unitPriceCents: totalPriceCents,
        totalPriceCents,
        storeId: options.storeId,
        storeNameSnapshot: options.storeName ?? 'Mercado histórico',
        purchasedByNameSnapshot: 'Raabe',
        purchasedAt: completedAt,
      },
    ],
  };
}

const august = { year: 2026, month: 8 };
const budget: HouseBudget = {
  id: 'budget',
  houseId: 'house-raabe-sidney',
  year: 2026,
  month: 8,
  amountCents: 100_00,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('seletores de gastos mensais', () => {
  it('soma somente sessões concluídas do mês em centavos', () => {
    const sessions = [
      session('a', '2026-08-03T12:00:00.000Z', 1_001),
      session('b', '2026-08-04T12:00:00.000Z', 2_002),
      session('active', '2026-08-05T12:00:00.000Z', 99_999, { status: 'active' }),
      session('cancelled', '2026-08-06T12:00:00.000Z', 88_888, { status: 'cancelled' }),
      session('july', '2026-07-31T12:00:00.000Z', 50_00),
    ];
    expect(getMonthlySpending(sessions, august)).toBe(3_003);
    expect(buildMonthlySpendingProjection(sessions, [], august).purchaseCount).toBe(2);
  });

  it('agrupa a virada de mês pelo horário de Brasília', () => {
    const beforeMidnight = session('before', '2026-09-01T02:30:00.000Z', 10_00);
    const afterMidnight = session('after', '2026-09-01T03:30:00.000Z', 20_00);
    expect(getMonthlySpending([beforeMidnight, afterMidnight], august)).toBe(10_00);
    expect(getMonthlySpending([beforeMidnight, afterMidnight], { year: 2026, month: 9 })).toBe(
      20_00,
    );
  });

  it('calcula comparação, alta, queda, estável e mês anterior vazio sem infinito', () => {
    const increase = [
      session('jul', '2026-07-10T12:00:00.000Z', 100_00),
      session('ago', '2026-08-10T12:00:00.000Z', 120_00),
    ];
    expect(getPreviousMonthComparison(increase, august)).toMatchObject({
      previousTotalCents: 100_00,
      differenceCents: 20_00,
      percentage: 20,
      trend: 'increase',
    });
    expect(
      getPreviousMonthComparison(
        [
          session('jul', '2026-07-10T12:00:00.000Z', 120_00),
          session('ago', '2026-08-10T12:00:00.000Z', 100_00),
        ],
        august,
      ).trend,
    ).toBe('decrease');
    expect(
      getPreviousMonthComparison(
        [
          session('jul', '2026-07-10T12:00:00.000Z', 100),
          session('ago', '2026-08-10T12:00:00.000Z', 100),
        ],
        august,
      ).trend,
    ).toBe('stable');
    const withoutPrevious = getPreviousMonthComparison(
      [session('ago', '2026-08-10T12:00:00.000Z', 100)],
      august,
    );
    expect(withoutPrevious.trend).toBe('unavailable');
    expect(withoutPrevious.percentage).toBeUndefined();
  });

  it('trata orçamento inexistente, disponível, 85%, 100% e excedido', () => {
    expect(getBudgetProgress(10_00)).toMatchObject({ budgetStatus: 'none' });
    expect(getBudgetProgress(85_00, budget)).toMatchObject({
      budgetStatus: 'warning',
      availableCents: 15_00,
      budgetPercentage: 85,
    });
    expect(getBudgetProgress(100_00, budget)).toMatchObject({
      budgetStatus: 'exceeded',
      availableCents: 0,
      budgetPercentage: 100,
    });
    expect(getBudgetProgress(120_00, budget)).toMatchObject({
      budgetStatus: 'exceeded',
      availableCents: -20_00,
    });
  });

  it('agrupa categorias por snapshot e preserva legado em Outros', () => {
    const sessions = [
      session('food', '2026-08-01T12:00:00.000Z', 75_00, { categoryName: 'Mercearia antiga' }),
      session('legacy', '2026-08-02T12:00:00.000Z', 25_00),
    ];
    expect(getCategoryBreakdown(sessions, august)).toEqual([
      expect.objectContaining({ name: 'Mercearia antiga', totalCents: 75_00, percentage: 75 }),
      expect.objectContaining({ name: 'Outros', totalCents: 25_00, percentage: 25 }),
    ]);
  });

  it('agrupa mercados por ID ou snapshot e conta compras, não itens', () => {
    const sessions = [
      session('a1', '2026-08-01T12:00:00.000Z', 60_00, { storeId: 'a', storeName: 'Nome antigo' }),
      session('a2', '2026-08-02T12:00:00.000Z', 20_00, {
        storeId: 'a',
        storeName: 'Nome renomeado',
      }),
      session('legacy', '2026-08-03T12:00:00.000Z', 20_00, { storeName: 'Mercado legado' }),
    ];
    expect(getStoreBreakdown(sessions, august)).toEqual([
      expect.objectContaining({ key: 'a', totalCents: 80_00, purchaseCount: 2, percentage: 80 }),
      expect.objectContaining({ name: 'Mercado legado', totalCents: 20_00, purchaseCount: 1 }),
    ]);
  });

  it('ordena maiores compras e acumula múltiplas compras no mesmo dia', () => {
    const sessions = [
      session('d3a', '2026-08-03T10:00:00.000Z', 10_00),
      session('d3b', '2026-08-03T18:00:00.000Z', 20_00),
      session('d8', '2026-08-08T10:00:00.000Z', 15_00),
    ];
    const projection = buildMonthlySpendingProjection(sessions, [], august);
    expect(projection.largestPurchases.map((purchase) => purchase.id)).toEqual([
      'd3b',
      'd8',
      'd3a',
    ]);
    expect(getMonthlyCumulativeSeries(sessions, august)).toEqual([
      expect.objectContaining({ day: 3, dailyTotalCents: 30_00, cumulativeTotalCents: 30_00 }),
      expect.objectContaining({ day: 8, dailyTotalCents: 15_00, cumulativeTotalCents: 45_00 }),
    ]);
  });

  it('representa a evolução acumulada de R$ 100, R$ 250 e R$ 500 nos dias corretos', () => {
    const sessions = [
      session('day-3', '2026-08-03T10:00:00.000Z', 100_00),
      session('day-8', '2026-08-08T10:00:00.000Z', 150_00),
      session('day-18', '2026-08-18T10:00:00.000Z', 250_00),
    ];

    expect(getMonthlyCumulativeSeries(sessions, august)).toEqual([
      expect.objectContaining({ day: 3, cumulativeTotalCents: 100_00 }),
      expect.objectContaining({ day: 8, cumulativeTotalCents: 250_00 }),
      expect.objectContaining({ day: 18, cumulativeTotalCents: 500_00 }),
    ]);
  });

  it('calcula 75% utilizado e R$ 250 disponíveis para orçamento de R$ 1.000', () => {
    const thousandBudget = { ...budget, amountCents: 1_000_00 };
    expect(getBudgetProgress(750_00, thousandBudget)).toMatchObject({
      budgetPercentage: 75,
      availableCents: 250_00,
      budgetStatus: 'moderate',
    });
  });

  it('atravessa dezembro e janeiro corretamente e calcula dias restantes no mês atual', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    const sessions = [
      session('dec', '2025-12-10T12:00:00.000Z', 50_00),
      session('jan', '2026-01-10T12:00:00.000Z', 75_00),
    ];
    expect(getPreviousMonthComparison(sessions, { year: 2026, month: 1 })).toMatchObject({
      previousTotalCents: 50_00,
      differenceCents: 25_00,
      percentage: 50,
    });
    const current = buildMonthlySpendingProjection(
      [session('aug', '2026-08-10T12:00:00.000Z', 40_00)],
      [budget],
      august,
      new Date(2026, 7, 25, 12),
    );
    expect(current.daysRemaining).toBe(6);
    expect(current.dailyAvailableCents).toBe(10_00);
    expect(
      buildMonthlySpendingProjection([], [], { year: 2026, month: 7 }, new Date(2026, 7, 25))
        .daysRemaining,
    ).toBeUndefined();
  });

  it('mantém estado vazio honesto', () => {
    expect(buildMonthlySpendingProjection([], [], august)).toMatchObject({
      totalSpentCents: 0,
      purchaseCount: 0,
      categories: [],
      stores: [],
      largestPurchases: [],
      cumulativeSeries: [],
      previousCumulativeSeries: [],
    });
  });
});
