import { describe, expect, it } from 'vitest';
import {
  buildProductRecurrenceProfiles,
  buildReplenishmentSuggestions,
} from '../application/replenishment-selectors';
import type { Product } from '../domain/catalog';
import type { PurchaseSession } from '../domain/purchase';
import type { ShoppingListItem } from '../domain/shopping-list';

const HOUSE = 'house-a';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'milk',
    houseId: HOUSE,
    name: 'Leite integral',
    normalizedName: 'leite integral',
    brand: '',
    categoryId: 'dairy',
    defaultQuantity: 2,
    defaultUnit: 'litro',
    notes: '',
    favorite: false,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function purchase(
  id: string,
  date: string,
  productId = 'milk',
  unit: 'litro' | 'garrafa' = 'litro',
): PurchaseSession {
  return {
    id,
    houseId: HOUSE,
    storeNameSnapshot: 'Mercado',
    status: 'completed',
    startedAt: date,
    completedAt: date,
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents: 600,
    items: [
      {
        id: `item-${id}`,
        houseId: HOUSE,
        purchaseSessionId: id,
        productId,
        productNameSnapshot: 'Leite integral',
        brandSnapshot: '',
        categorySnapshot: 'laticinios',
        prioritySnapshot: 'normal',
        notesSnapshot: '',
        plannedQuantity: 1,
        purchasedQuantity: 1,
        unitSnapshot: unit,
        unitPriceCents: 600,
        totalPriceCents: 600,
        storeNameSnapshot: 'Mercado',
        purchasedByNameSnapshot: 'Raabe',
        purchasedAt: date,
      },
    ],
  };
}

const history = [
  purchase('one', '2026-08-01T12:00:00.000Z'),
  purchase('two', '2026-08-08T12:00:00.000Z'),
  purchase('three', '2026-08-15T12:00:00.000Z'),
];

describe('recorrência e sugestões de reposição', () => {
  it('usa a mediana dos intervalos de três compras concluídas', () => {
    expect(buildProductRecurrenceProfiles([product()], history, HOUSE).get('milk')).toMatchObject({
      purchaseCount: 3,
      typicalIntervalDays: 7,
      compatibleUnit: 'litro',
    });
  });

  it('ignora compras repetidas no mesmo dia e exige histórico suficiente', () => {
    const duplicateDay = purchase('duplicate', '2026-08-08T18:00:00.000Z');
    const profile = buildProductRecurrenceProfiles(
      [product()],
      [history[0]!, history[1]!, duplicateDay],
      HOUSE,
    ).get('milk');
    expect(profile).toMatchObject({ purchaseCount: 2, typicalIntervalDays: undefined });
    expect(
      buildReplenishmentSuggestions(
        [product()],
        history.slice(0, 2),
        [],
        HOUSE,
        new Date('2026-08-25T12:00:00.000Z'),
      ),
    ).toEqual([]);
  });

  it('não mistura unidades incompatíveis', () => {
    const mixed = [
      history[0]!,
      purchase('bottle', '2026-08-08T12:00:00.000Z', 'milk', 'garrafa'),
      history[2]!,
    ];
    expect(buildProductRecurrenceProfiles([product()], mixed, HOUSE).get('milk')).toMatchObject({
      purchaseCount: 2,
      typicalIntervalDays: undefined,
    });
  });

  it('sugere recorrência manual somente quando o prazo venceu', () => {
    const recurring = product({ isRecurring: true, recurrenceDays: 10 });
    expect(
      buildReplenishmentSuggestions(
        [recurring],
        history.slice(0, 1),
        [],
        HOUSE,
        new Date('2026-08-10T12:00:00.000Z'),
      ),
    ).toEqual([]);
    expect(
      buildReplenishmentSuggestions(
        [recurring],
        history.slice(0, 1),
        [],
        HOUSE,
        new Date('2026-08-12T12:00:00.000Z'),
      )[0],
    ).toMatchObject({
      product: { id: 'milk' },
      intervalDays: 10,
      source: 'manual',
    });
  });

  it('sugere pelo histórico sem afirmar que o produto acabou', () => {
    const [suggestion] = buildReplenishmentSuggestions(
      [product()],
      history,
      [],
      HOUSE,
      new Date('2026-08-23T12:00:00.000Z'),
    );
    expect(suggestion).toMatchObject({
      intervalDays: 7,
      daysSinceLastPurchase: 8,
      source: 'history',
    });
    expect(suggestion?.reason).toMatch(/costuma comprar/i);
  });

  it('bloqueia produto já na Lista, inativo e pertencente a outra Casa', () => {
    const listed = { houseId: HOUSE, productId: 'milk' } as ShoppingListItem;
    const now = new Date('2026-08-23T12:00:00.000Z');
    expect(buildReplenishmentSuggestions([product()], history, [listed], HOUSE, now)).toEqual([]);
    expect(
      buildReplenishmentSuggestions([product({ active: false })], history, [], HOUSE, now),
    ).toEqual([]);
    expect(
      buildReplenishmentSuggestions([product({ houseId: 'house-b' })], history, [], HOUSE, now),
    ).toEqual([]);
  });
});
