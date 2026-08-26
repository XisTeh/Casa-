import { describe, expect, it } from 'vitest';
import { buildMonthlyReport } from '../application/monthly-report-selectors';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';

const HOUSE = 'house-report';

function item(
  id: string,
  productId: string,
  name: string,
  totalPriceCents: number,
  options: Partial<PurchaseItem> = {},
): PurchaseItem {
  return {
    id,
    houseId: HOUSE,
    purchaseSessionId: options.purchaseSessionId ?? '',
    productId,
    productNameSnapshot: name,
    brandSnapshot: '',
    categorySnapshot: 'mercearia',
    categoryNameSnapshot: 'Mercearia',
    prioritySnapshot: 'normal',
    notesSnapshot: '',
    plannedQuantity: 1,
    purchasedQuantity: 1,
    unitSnapshot: 'unidade',
    unitPriceCents: totalPriceCents,
    totalPriceCents,
    storeNameSnapshot: 'Mercado',
    purchasedByNameSnapshot: 'Raabe',
    purchasedAt: '2026-08-01T12:00:00.000Z',
    ...options,
  };
}

function session(
  id: string,
  completedAt: string,
  storeId: string,
  storeName: string,
  items: PurchaseItem[],
): PurchaseSession {
  const hydrated = items.map((purchaseItem) => ({
    ...purchaseItem,
    purchaseSessionId: id,
    purchasedAt: purchaseItem.purchasedAt || completedAt,
    storeId,
    storeNameSnapshot: storeName,
  }));
  return {
    id,
    houseId: HOUSE,
    storeId,
    storeNameSnapshot: storeName,
    status: 'completed',
    startedAt: completedAt,
    completedAt,
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents: hydrated.reduce(
      (total, purchaseItem) => total + purchaseItem.totalPriceCents,
      0,
    ),
    items: hydrated,
  };
}

describe('relatório mensal derivado', () => {
  it('mantém estado vazio sem inventar métricas', () => {
    expect(buildMonthlyReport([], [], { year: 2026, month: 8 })).toMatchObject({
      totalSpentCents: 0,
      purchaseCount: 0,
      averageTicketCents: 0,
      distinctProductCount: 0,
      largestPurchase: undefined,
      highestSpendingProduct: undefined,
    });
  });

  it('calcula total, quantidade, ticket médio, maior e menor compra', () => {
    const sessions = [
      session('one', '2026-08-03T12:00:00.000Z', 'a', 'Atacadão', [
        item('rice-one', 'rice', 'Arroz', 80_00),
      ]),
      session('two', '2026-08-08T12:00:00.000Z', 'b', 'Bairro', [
        item('milk-two', 'milk', 'Leite', 20_00),
      ]),
    ];
    expect(buildMonthlyReport(sessions, [], { year: 2026, month: 8 })).toMatchObject({
      totalSpentCents: 100_00,
      purchaseCount: 2,
      averageTicketCents: 50_00,
      largestPurchase: { id: 'one' },
      smallestPurchase: { id: 'two' },
    });
  });

  it('separa mercado de maior gasto, mercado mais usado, categoria e produtos', () => {
    const sessions = [
      session('a', '2026-08-01T12:00:00.000Z', 'premium', 'Premium', [
        item('rice-a', 'rice', 'Arroz', 90_00, { categoryNameSnapshot: 'Mercearia' }),
      ]),
      session('b1', '2026-08-02T12:00:00.000Z', 'bairro', 'Bairro', [
        item('milk-b1', 'milk', 'Leite', 20_00, { categoryNameSnapshot: 'Laticínios' }),
      ]),
      session('b2', '2026-08-09T12:00:00.000Z', 'bairro', 'Bairro', [
        item('milk-b2', 'milk', 'Leite', 25_00, { categoryNameSnapshot: 'Laticínios' }),
      ]),
    ];
    const report = buildMonthlyReport(sessions, [], { year: 2026, month: 8 });
    expect(report.highestSpendingStore?.name).toBe('Premium');
    expect(report.mostFrequentStore).toMatchObject({ name: 'Bairro', purchaseCount: 2 });
    expect(report.highestSpendingCategory).toMatchObject({ name: 'Mercearia', totalCents: 90_00 });
    expect(report.highestSpendingProduct).toMatchObject({ productId: 'rice', totalCents: 90_00 });
    expect(report.mostPurchasedProduct).toMatchObject({ productId: 'milk', purchaseCount: 2 });
    expect(report.distinctProductCount).toBe(2);
  });

  it('compara com o mês anterior, inclusive quando a base é zero e na virada do ano', () => {
    const december = session('dec', '2025-12-20T12:00:00.000Z', 'a', 'A', [
      item('dec-item', 'rice', 'Arroz', 100_00),
    ]);
    const january = session('jan', '2026-01-05T12:00:00.000Z', 'a', 'A', [
      item('jan-item', 'rice', 'Arroz', 125_00),
    ]);
    const report = buildMonthlyReport([december, january], [], { year: 2026, month: 1 });
    expect(report.comparison).toMatchObject({
      previousTotalCents: 100_00,
      differenceCents: 25_00,
      percentage: 25,
    });
    expect(report.evolution.at(-1)).toMatchObject({ year: 2026, month: 1, totalCents: 125_00 });
    expect(
      buildMonthlyReport([january], [], { year: 2026, month: 1 }).comparison.percentage,
    ).toBeUndefined();
  });

  it('compara preços somente por produto e unidade compatíveis', () => {
    const july = session('jul', '2026-07-20T12:00:00.000Z', 'a', 'A', [
      item('rice-jul', 'rice', 'Arroz', 20_00, {
        unitSnapshot: 'pacote',
        unitPriceCents: 20_00,
        purchasedAt: '2026-07-20T12:00:00.000Z',
      }),
      item('milk-jul', 'milk', 'Leite', 6_00, {
        unitSnapshot: 'litro',
        unitPriceCents: 6_00,
        purchasedAt: '2026-07-20T12:00:00.000Z',
      }),
    ]);
    const august = session('aug', '2026-08-20T12:00:00.000Z', 'a', 'A', [
      item('rice-aug', 'rice', 'Arroz', 18_00, {
        unitSnapshot: 'pacote',
        unitPriceCents: 18_00,
        purchasedAt: '2026-08-20T12:00:00.000Z',
      }),
      item('milk-aug', 'milk', 'Leite', 9_00, {
        unitSnapshot: 'garrafa',
        unitPriceCents: 9_00,
        purchasedAt: '2026-08-20T12:00:00.000Z',
      }),
    ]);
    const report = buildMonthlyReport([july, august], [], { year: 2026, month: 8 });
    expect(report.largestPriceDecrease).toMatchObject({
      productId: 'rice',
      differenceCents: -2_00,
    });
    expect(report.largestPriceIncrease).toBeUndefined();
  });
});
