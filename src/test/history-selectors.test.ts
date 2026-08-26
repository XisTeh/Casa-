import { describe, expect, it } from 'vitest';
import {
  filterPurchaseHistory,
  getProductPriceHistory,
  getPurchaseItemIdentity,
  groupPurchasesByMonth,
  summarizePurchaseHistory,
} from '../application/history-selectors';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import { HOUSE_ID } from '../domain/shopping-list';

function makeItem(id: string, name: string, price: number, productId?: string): PurchaseItem {
  return {
    id,
    houseId: HOUSE_ID,
    purchaseSessionId: `session-${id}`,
    sourceShoppingItemId: `source-${id}`,
    productId,
    productNameSnapshot: name,
    brandSnapshot: '',
    categorySnapshot: 'mercearia',
    prioritySnapshot: 'normal',
    notesSnapshot: '',
    plannedQuantity: 1,
    purchasedQuantity: 1,
    unitSnapshot: 'pacote',
    unitPriceCents: price,
    totalPriceCents: price,
    storeId: 'store-1',
    storeNameSnapshot: 'Mercado',
    purchasedByNameSnapshot: 'Raabe',
    purchasedAt: `2026-0${id}-10T12:00:00.000Z`,
  };
}

function makeSession(
  id: string,
  completedAt: string,
  item: PurchaseItem,
  buyer = 'Raabe',
): PurchaseSession {
  item.purchaseSessionId = id;
  item.purchasedAt = completedAt;
  return {
    id,
    houseId: HOUSE_ID,
    storeId: 'store-1',
    storeNameSnapshot: 'Mercado',
    status: 'completed',
    startedAt: completedAt,
    completedAt,
    purchasedByNameSnapshot: buyer,
    totalPriceCents: item.totalPriceCents,
    items: [item],
  };
}

describe('seletores de histórico e preços', () => {
  const sessions = [
    makeSession(
      'session-1',
      '2026-08-20T12:00:00.000Z',
      makeItem('1', 'Arroz antigo', 900, 'product-rice'),
    ),
    makeSession(
      'session-2',
      '2026-07-10T12:00:00.000Z',
      makeItem('2', 'Arroz novo', 1100, 'product-rice'),
      'Sidney',
    ),
  ];

  it('filtra por período, mercado, comprador e texto do snapshot', () => {
    expect(
      filterPurchaseHistory(
        sessions,
        { period: '30-days', storeId: '', buyer: '', query: '' },
        new Date('2026-08-25T12:00:00.000Z'),
      ),
    ).toHaveLength(1);
    expect(
      filterPurchaseHistory(sessions, {
        period: 'all',
        storeId: 'store-1',
        buyer: 'Sidney',
        query: 'arroz novo',
      }),
    ).toEqual([sessions[1]]);
    expect(
      filterPurchaseHistory(sessions, { period: 'all', storeId: '', buyer: '', query: 'feijão' }),
    ).toEqual([]);
  });

  it('calcula resumo e agrupamento mensal com valores filtrados', () => {
    expect(summarizePurchaseHistory(sessions)).toEqual({
      purchaseCount: 2,
      totalSpentCents: 2000,
      averageSpentCents: 1000,
    });
    expect(groupPurchasesByMonth(sessions).map((group) => group.key)).toEqual([
      '2026-08',
      '2026-07',
    ]);
  });

  it('usa productId como identidade e calcula estatísticas de preço', () => {
    const identity = getPurchaseItemIdentity(sessions[0]!.items[0]!);
    const stats = getProductPriceHistory(sessions, identity);
    expect(identity).toBe('product:product-rice');
    expect(stats).toMatchObject({
      latestPriceCents: 900,
      lowestPriceCents: 900,
      highestPriceCents: 1100,
      averagePriceCents: 1000,
    });
  });
});
