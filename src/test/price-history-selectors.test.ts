import { describe, expect, it } from 'vitest';
import {
  buildPriceHistoryProjections,
  calculatePriceVariation,
  filterPriceHistoryProjections,
  getPriceItemIdentity,
} from '../application/price-history-selectors';
import type { Category, Product } from '../domain/catalog';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import { HOUSE_ID, type ShoppingUnit } from '../domain/shopping-list';

const category: Category = {
  id: 'category-rice',
  houseId: HOUSE_ID,
  name: 'Mercearia',
  normalizedName: 'mercearia',
  legacyKey: 'mercearia',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-rice',
    houseId: HOUSE_ID,
    name: 'Arroz atual',
    normalizedName: 'arroz atual',
    brand: 'Tio João',
    categoryId: category.id,
    defaultQuantity: 1,
    defaultUnit: 'pacote',
    notes: '',
    favorite: false,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function purchaseItem(options: {
  id: string;
  price: number;
  purchasedAt: string;
  storeId: string;
  storeName: string;
  productId?: string;
  name?: string;
  unit?: ShoppingUnit;
  quantity?: number;
}): PurchaseItem {
  const quantity = options.quantity ?? 1;
  return {
    id: options.id,
    houseId: HOUSE_ID,
    purchaseSessionId: `session-${options.id}`,
    origin: 'manual',
    productId: options.productId,
    productNameSnapshot: options.name ?? 'Arroz snapshot',
    brandSnapshot: 'Marca snapshot',
    categorySnapshot: 'mercearia',
    categoryNameSnapshot: 'Mercearia',
    prioritySnapshot: 'normal',
    notesSnapshot: '',
    plannedQuantity: quantity,
    purchasedQuantity: quantity,
    unitSnapshot: options.unit ?? 'pacote',
    unitPriceCents: options.price,
    totalPriceCents: Math.round(quantity * options.price),
    storeId: options.storeId,
    storeNameSnapshot: options.storeName,
    purchasedByNameSnapshot: 'Raabe',
    purchasedAt: options.purchasedAt,
  };
}

function session(item: PurchaseItem): PurchaseSession {
  return {
    id: item.purchaseSessionId,
    houseId: HOUSE_ID,
    storeId: item.storeId,
    storeNameSnapshot: item.storeNameSnapshot,
    status: 'completed',
    startedAt: item.purchasedAt,
    completedAt: item.purchasedAt,
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents: item.totalPriceCents,
    items: [item],
  };
}

describe('projeções de histórico e comparação de preços', () => {
  it('trata primeiro preço, aumento, queda, estabilidade e preço anterior zero', () => {
    expect(calculatePriceVariation(1000)).toEqual({ trend: 'unavailable' });
    expect(calculatePriceVariation(1200, 1000)).toMatchObject({
      trend: 'increase',
      absoluteCents: 200,
      percentage: 20,
    });
    expect(calculatePriceVariation(1000, 1200)).toMatchObject({
      trend: 'decrease',
      absoluteCents: -200,
      percentage: expect.closeTo(-16.666, 2),
    });
    expect(calculatePriceVariation(1000, 1000)).toEqual({
      trend: 'stable',
      absoluteCents: 0,
      percentage: 0,
    });
    expect(calculatePriceVariation(1000, 0)).toEqual({
      trend: 'increase',
      absoluteCents: 1000,
    });
  });

  it('calcula último, anterior, mínimo, máximo, média, ordem cronológica e mercados', () => {
    const items = [
      purchaseItem({
        id: '1',
        productId: 'product-rice',
        price: 600,
        purchasedAt: '2026-07-01T10:00:00.000Z',
        storeId: 'store-a',
        storeName: 'Atacadão',
      }),
      purchaseItem({
        id: '2',
        productId: 'product-rice',
        price: 700,
        purchasedAt: '2026-08-01T10:00:00.000Z',
        storeId: 'store-b',
        storeName: 'Assaí',
      }),
      purchaseItem({
        id: '3',
        productId: 'product-rice',
        price: 550,
        purchasedAt: '2026-08-20T10:00:00.000Z',
        storeId: 'store-a',
        storeName: 'Atacadão',
      }),
    ];
    const [projection] = buildPriceHistoryProjections(
      items.map((item) => session(item)),
      [product()],
      [category],
    );
    const unit = projection!.primaryUnit;
    expect(unit.latestRecord.unitPriceCents).toBe(550);
    expect(unit.previousRecord?.unitPriceCents).toBe(700);
    expect(unit.variation.percentage).toBeCloseTo(-21.428, 2);
    expect(unit.lowestRecord).toMatchObject({ unitPriceCents: 550, storeName: 'Atacadão' });
    expect(unit.highestRecord).toMatchObject({ unitPriceCents: 700, storeName: 'Assaí' });
    expect(unit.averagePriceCents).toBe(617);
    expect(unit.chronologicalRecords.map((record) => record.unitPriceCents)).toEqual([
      600, 700, 550,
    ]);
    expect(unit.stores).toMatchObject([
      {
        storeName: 'Atacadão',
        recordCount: 2,
        latestRecord: { unitPriceCents: 550 },
        lowestRecord: { unitPriceCents: 550 },
      },
      {
        storeName: 'Assaí',
        recordCount: 1,
        latestRecord: { unitPriceCents: 700 },
        lowestRecord: { unitPriceCents: 700 },
      },
    ]);
  });

  it('separa unidades incompatíveis e nunca mistura suas médias ou rankings', () => {
    const packageItem = purchaseItem({
      id: 'package',
      productId: 'product-rice',
      price: 700,
      purchasedAt: '2026-08-01T10:00:00.000Z',
      storeId: 'store-a',
      storeName: 'Atacadão',
      unit: 'pacote',
    });
    const kiloItem = purchaseItem({
      id: 'kg',
      productId: 'product-rice',
      price: 1200,
      purchasedAt: '2026-08-20T10:00:00.000Z',
      storeId: 'store-b',
      storeName: 'Assaí',
      unit: 'kg',
    });
    const [projection] = buildPriceHistoryProjections(
      [session(packageItem), session(kiloItem)],
      [product()],
      [category],
    );
    expect(projection!.units).toHaveLength(2);
    expect(projection!.units.find((unit) => unit.unit === 'pacote')).toMatchObject({
      averagePriceCents: 700,
      recordCount: 1,
      variation: { trend: 'unavailable' },
    });
    expect(projection!.units.find((unit) => unit.unit === 'kg')).toMatchObject({
      averagePriceCents: 1200,
      recordCount: 1,
      variation: { trend: 'unavailable' },
    });
  });

  it('agrupa produto renomeado por productId, preserva snapshots e inclui produto inativo', () => {
    const first = purchaseItem({
      id: 'old',
      productId: 'product-rice',
      name: 'Arroz antigo',
      price: 600,
      purchasedAt: '2026-07-01T10:00:00.000Z',
      storeId: 'store-a',
      storeName: 'Atacadão',
    });
    const second = purchaseItem({
      id: 'new',
      productId: 'product-rice',
      name: 'Arroz novo snapshot',
      price: 650,
      purchasedAt: '2026-08-01T10:00:00.000Z',
      storeId: 'store-b',
      storeName: 'Assaí',
    });
    const [projection] = buildPriceHistoryProjections(
      [session(first), session(second)],
      [product({ name: 'Arroz atual 1kg', active: false })],
      [category],
    );
    expect(projection).toMatchObject({
      identity: 'product:product-rice',
      name: 'Arroz atual 1kg',
      active: false,
      recordCount: 2,
    });
    expect(
      projection!.primaryUnit.records.map((record) => record.item.productNameSnapshot),
    ).toEqual(['Arroz novo snapshot', 'Arroz antigo']);
  });

  it('mantém legado sem productId separado e calcula centavos sem erro de float', () => {
    const legacy = purchaseItem({
      id: 'legacy',
      name: 'Banana Prata',
      price: 899,
      purchasedAt: '2026-08-01T10:00:00.000Z',
      storeId: 'store-a',
      storeName: 'Feira',
      unit: 'kg',
      quantity: 1.5,
    });
    const [projection] = buildPriceHistoryProjections([session(legacy)], [], [category]);
    expect(getPriceItemIdentity(legacy)).toBe('legacy-name:banana prata');
    expect(projection).toMatchObject({
      productId: undefined,
      name: 'Banana Prata',
      primaryUnit: { averagePriceCents: 899 },
    });
    expect(projection!.latestRecord.totalPriceCents).toBe(1349);
  });

  it('filtra busca/categoria/mercado e ordena por aumento, queda, menor preço e nome', () => {
    const riceItems = [
      purchaseItem({
        id: 'r1',
        productId: 'product-rice',
        price: 500,
        purchasedAt: '2026-07-01T10:00:00.000Z',
        storeId: 'store-a',
        storeName: 'Atacadão',
      }),
      purchaseItem({
        id: 'r2',
        productId: 'product-rice',
        price: 600,
        purchasedAt: '2026-08-01T10:00:00.000Z',
        storeId: 'store-a',
        storeName: 'Atacadão',
      }),
    ];
    const coffeeProduct = product({ id: 'product-coffee', name: 'Café', normalizedName: 'cafe' });
    const coffeeItems = [
      purchaseItem({
        id: 'c1',
        productId: 'product-coffee',
        name: 'Café',
        price: 900,
        purchasedAt: '2026-07-02T10:00:00.000Z',
        storeId: 'store-b',
        storeName: 'Assaí',
      }),
      purchaseItem({
        id: 'c2',
        productId: 'product-coffee',
        name: 'Café',
        price: 800,
        purchasedAt: '2026-08-02T10:00:00.000Z',
        storeId: 'store-b',
        storeName: 'Assaí',
      }),
    ];
    const projections = buildPriceHistoryProjections(
      [...riceItems, ...coffeeItems].map((item) => session(item)),
      [product(), coffeeProduct],
      [category],
    );
    expect(
      filterPriceHistoryProjections(projections, {
        query: 'cafe',
        categoryId: '',
        storeId: '',
        order: 'recent',
      }),
    ).toHaveLength(1);
    expect(
      filterPriceHistoryProjections(projections, {
        query: '',
        categoryId: category.id,
        storeId: 'store-a',
        order: 'recent',
      }),
    ).toHaveLength(1);
    expect(
      filterPriceHistoryProjections(projections, {
        query: '',
        categoryId: '',
        storeId: '',
        order: 'increase',
      })[0]?.name,
    ).toBe('Arroz atual');
    expect(
      filterPriceHistoryProjections(projections, {
        query: '',
        categoryId: '',
        storeId: '',
        order: 'decrease',
      })[0]?.name,
    ).toBe('Café');
    expect(
      filterPriceHistoryProjections(projections, {
        query: '',
        categoryId: '',
        storeId: '',
        order: 'lowest',
      })[0]?.name,
    ).toBe('Arroz atual');
    expect(
      filterPriceHistoryProjections(projections, {
        query: '',
        categoryId: '',
        storeId: '',
        order: 'name',
      }).map((item) => item.name),
    ).toEqual(['Arroz atual', 'Café']);
  });
});
