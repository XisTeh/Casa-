import { describe, expect, it } from 'vitest';
import {
  buildKnownProducts,
  findKnownProductSuggestions,
  findUnambiguousExactProduct,
} from '../application/known-product-selectors';
import type { PurchaseSession } from '../domain/purchase';
import { initialShoppingListSeed } from '../domain/shopping-list';

describe('known product selectors', () => {
  it('combina Lista e Histórico, preserva productId e mostra o último preço', () => {
    const history: PurchaseSession[] = [
      {
        id: 'purchase-known',
        houseId: 'house',
        storeNameSnapshot: 'Mercado',
        status: 'completed',
        startedAt: '2026-08-25T10:00:00.000Z',
        completedAt: '2026-08-25T11:00:00.000Z',
        purchasedByNameSnapshot: 'Raabe',
        totalPriceCents: 3490,
        items: [
          {
            id: 'purchase-known:rice',
            houseId: 'house',
            purchaseSessionId: 'purchase-known',
            origin: 'manual',
            productId: 'product-rice',
            productNameSnapshot: 'Arroz Tio João',
            brandSnapshot: 'Tio João',
            categorySnapshot: 'mercearia',
            prioritySnapshot: 'normal',
            notesSnapshot: '',
            plannedQuantity: 1,
            purchasedQuantity: 1,
            unitSnapshot: 'pacote',
            unitPriceCents: 3490,
            totalPriceCents: 3490,
            storeNameSnapshot: 'Mercado',
            purchasedByNameSnapshot: 'Raabe',
            purchasedAt: '2026-08-25T10:30:00.000Z',
          },
        ],
      },
    ];

    const products = buildKnownProducts(initialShoppingListSeed, history);
    expect(findKnownProductSuggestions(products, 'Arr')).toContainEqual(
      expect.objectContaining({
        productId: 'product-rice',
        name: 'Arroz Tio João',
        lastPriceCents: 3490,
      }),
    );
    expect(findUnambiguousExactProduct(products, 'arroz tio joao')?.productId).toBe('product-rice');
  });
});
