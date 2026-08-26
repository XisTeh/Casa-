import type { Category, Product } from '../domain/catalog';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import { shoppingCategoryLabels, type ShoppingUnit } from '../domain/shopping-list';
import { normalizeCatalogName } from '../domain/catalog';

export type PriceTrend = 'increase' | 'decrease' | 'stable' | 'unavailable';

export type PriceVariation = {
  trend: PriceTrend;
  absoluteCents?: number;
  percentage?: number;
};

export type PriceRecord = {
  identity: string;
  productId?: string;
  item: PurchaseItem;
  unit: ShoppingUnit;
  unitPriceCents: number;
  totalPriceCents: number;
  quantity: number;
  purchasedAt: string;
  storeId?: string;
  storeName: string;
};

export type StorePriceProjection = {
  key: string;
  storeId?: string;
  storeName: string;
  recordCount: number;
  latestRecord: PriceRecord;
  lowestRecord: PriceRecord;
  highestRecord: PriceRecord;
  averagePriceCents: number;
  records: PriceRecord[];
};

export type UnitPriceProjection = {
  unit: ShoppingUnit;
  recordCount: number;
  records: PriceRecord[];
  chronologicalRecords: PriceRecord[];
  latestRecord: PriceRecord;
  previousRecord?: PriceRecord;
  variation: PriceVariation;
  lowestRecord: PriceRecord;
  highestRecord: PriceRecord;
  averagePriceCents: number;
  stores: StorePriceProjection[];
};

export type ProductPriceProjection = {
  identity: string;
  productId?: string;
  product?: Product;
  name: string;
  brand: string;
  categoryId?: string;
  categoryName: string;
  active?: boolean;
  recordCount: number;
  latestPurchasedAt: string;
  latestRecord: PriceRecord;
  primaryUnit: UnitPriceProjection;
  units: UnitPriceProjection[];
};

export type PriceProjectionFilters = {
  query: string;
  categoryId: string;
  storeId: string;
  order: 'recent' | 'increase' | 'decrease' | 'lowest' | 'name';
};

export function getPriceItemIdentity(item: PurchaseItem) {
  return item.productId
    ? `product:${item.productId}`
    : `legacy-name:${normalizeCatalogName(item.productNameSnapshot)}`;
}

export function calculatePriceVariation(
  latestPriceCents: number,
  previousPriceCents?: number,
): PriceVariation {
  if (previousPriceCents === undefined) return { trend: 'unavailable' };
  const absoluteCents = latestPriceCents - previousPriceCents;
  if (absoluteCents === 0) return { trend: 'stable', absoluteCents: 0, percentage: 0 };
  if (previousPriceCents <= 0) {
    return {
      trend: absoluteCents > 0 ? 'increase' : 'decrease',
      absoluteCents,
    };
  }
  return {
    trend: absoluteCents > 0 ? 'increase' : 'decrease',
    absoluteCents,
    percentage: (absoluteCents / previousPriceCents) * 100,
  };
}

function averagePrice(records: PriceRecord[]) {
  return records.length
    ? Math.round(
        records.reduce((total, record) => total + record.unitPriceCents, 0) / records.length,
      )
    : 0;
}

function lowestRecord(records: PriceRecord[]) {
  return records.reduce((lowest, record) =>
    record.unitPriceCents < lowest.unitPriceCents ? record : lowest,
  );
}

function highestRecord(records: PriceRecord[]) {
  return records.reduce((highest, record) =>
    record.unitPriceCents > highest.unitPriceCents ? record : highest,
  );
}

function storeKey(record: PriceRecord) {
  return record.storeId ?? `legacy-store:${normalizeCatalogName(record.storeName)}`;
}

function buildStoreProjections(records: PriceRecord[]): StorePriceProjection[] {
  const stores = new Map<string, PriceRecord[]>();
  records.forEach((record) => {
    const key = storeKey(record);
    stores.set(key, [...(stores.get(key) ?? []), record]);
  });
  return [...stores.entries()]
    .map(([key, storeRecords]) => {
      const sorted = [...storeRecords].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
      const latest = sorted[0]!;
      return {
        key,
        storeId: latest.storeId,
        storeName: latest.storeName,
        recordCount: sorted.length,
        latestRecord: latest,
        lowestRecord: lowestRecord(sorted),
        highestRecord: highestRecord(sorted),
        averagePriceCents: averagePrice(sorted),
        records: sorted,
      };
    })
    .sort(
      (a, b) =>
        a.lowestRecord.unitPriceCents - b.lowestRecord.unitPriceCents ||
        a.storeName.localeCompare(b.storeName, 'pt-BR'),
    );
}

function buildUnitProjection(unit: ShoppingUnit, records: PriceRecord[]): UnitPriceProjection {
  const sorted = [...records].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  const latest = sorted[0]!;
  const previous = sorted[1];
  return {
    unit,
    recordCount: sorted.length,
    records: sorted,
    chronologicalRecords: [...sorted].reverse(),
    latestRecord: latest,
    previousRecord: previous,
    variation: calculatePriceVariation(latest.unitPriceCents, previous?.unitPriceCents),
    lowestRecord: lowestRecord(sorted),
    highestRecord: highestRecord(sorted),
    averagePriceCents: averagePrice(sorted),
    stores: buildStoreProjections(sorted),
  };
}

function categorySnapshot(item: PurchaseItem) {
  return item.categoryNameSnapshot ?? shoppingCategoryLabels[item.categorySnapshot];
}

export function buildPriceHistoryProjections(
  sessions: PurchaseSession[],
  products: Product[],
  categories: Category[],
): ProductPriceProjection[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryByLegacy = new Map(
    categories
      .filter((category) => category.legacyKey)
      .map((category) => [category.legacyKey!, category]),
  );
  const recordsByIdentity = new Map<string, PriceRecord[]>();

  sessions
    .filter((session) => session.status === 'completed')
    .flatMap((session) => session.items)
    .forEach((item) => {
      const identity = getPriceItemIdentity(item);
      const record: PriceRecord = {
        identity,
        productId: item.productId,
        item,
        unit: item.unitSnapshot,
        unitPriceCents: item.unitPriceCents,
        totalPriceCents: item.totalPriceCents,
        quantity: item.purchasedQuantity,
        purchasedAt: item.purchasedAt,
        storeId: item.storeId,
        storeName: item.storeNameSnapshot,
      };
      recordsByIdentity.set(identity, [...(recordsByIdentity.get(identity) ?? []), record]);
    });

  return [...recordsByIdentity.entries()]
    .map(([identity, records]) => {
      const sorted = [...records].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
      const latest = sorted[0]!;
      const product = latest.productId ? productById.get(latest.productId) : undefined;
      const unitsByName = new Map<ShoppingUnit, PriceRecord[]>();
      sorted.forEach((record) =>
        unitsByName.set(record.unit, [...(unitsByName.get(record.unit) ?? []), record]),
      );
      const units = [...unitsByName.entries()]
        .map(([unit, unitRecords]) => buildUnitProjection(unit, unitRecords))
        .sort((a, b) => {
          if (a.unit === latest.unit) return -1;
          if (b.unit === latest.unit) return 1;
          return a.unit.localeCompare(b.unit, 'pt-BR');
        });
      const category = product
        ? categoryById.get(product.categoryId)
        : (categoryByLegacy.get(latest.item.categorySnapshot) ??
          categories.find(
            (candidate) =>
              candidate.normalizedName === normalizeCatalogName(categorySnapshot(latest.item)),
          ));
      return {
        identity,
        productId: product?.id ?? latest.productId,
        product,
        name: product?.name ?? latest.item.productNameSnapshot,
        brand: product?.brand ?? latest.item.brandSnapshot,
        categoryId: product?.categoryId ?? category?.id,
        categoryName: category?.name ?? categorySnapshot(latest.item),
        active: product?.active,
        recordCount: sorted.length,
        latestPurchasedAt: latest.purchasedAt,
        latestRecord: latest,
        primaryUnit: units[0]!,
        units,
      } satisfies ProductPriceProjection;
    })
    .sort((a, b) => b.latestPurchasedAt.localeCompare(a.latestPurchasedAt));
}

export function filterPriceHistoryProjections(
  projections: ProductPriceProjection[],
  filters: PriceProjectionFilters,
) {
  const query = normalizeCatalogName(filters.query);
  const filtered = projections.filter((projection) => {
    const searchable = normalizeCatalogName(
      `${projection.name} ${projection.brand} ${projection.categoryName}`,
    );
    return (
      (!query || searchable.includes(query)) &&
      (!filters.categoryId || projection.categoryId === filters.categoryId) &&
      (!filters.storeId ||
        projection.units.some((unit) =>
          unit.stores.some((store) => store.storeId === filters.storeId),
        ))
    );
  });

  return [...filtered].sort((a, b) => {
    if (filters.order === 'name') return a.name.localeCompare(b.name, 'pt-BR');
    if (filters.order === 'lowest') {
      return a.primaryUnit.lowestRecord.unitPriceCents - b.primaryUnit.lowestRecord.unitPriceCents;
    }
    if (filters.order === 'increase') {
      return (
        (b.primaryUnit.variation.percentage ?? -Infinity) -
        (a.primaryUnit.variation.percentage ?? -Infinity)
      );
    }
    if (filters.order === 'decrease') {
      return (
        (a.primaryUnit.variation.percentage ?? Infinity) -
        (b.primaryUnit.variation.percentage ?? Infinity)
      );
    }
    return b.latestPurchasedAt.localeCompare(a.latestPurchasedAt);
  });
}
