import { normalizeCatalogName, type Product } from '../domain/catalog';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import type { ShoppingListItem, ShoppingUnit } from '../domain/shopping-list';

const DAY_MS = 86_400_000;

export type ProductRecurrenceProfile = {
  productId: string;
  lastPurchasedAt?: string;
  purchaseCount: number;
  typicalIntervalDays?: number;
  compatibleUnit: ShoppingUnit;
};

export type ReplenishmentSuggestion = ProductRecurrenceProfile & {
  product: Product;
  intervalDays: number;
  daysSinceLastPurchase: number;
  overdueDays: number;
  source: 'manual' | 'history';
  reason: string;
};

function dayNumber(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : undefined;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function buildLegacyResolver(products: Product[]) {
  const groups = new Map<string, Product[]>();
  products.forEach((product) => {
    const values = groups.get(product.normalizedName) ?? [];
    values.push(product);
    groups.set(product.normalizedName, values);
  });
  return (item: PurchaseItem) => {
    if (item.productId) return item.productId;
    const candidates = groups.get(normalizeCatalogName(item.productNameSnapshot)) ?? [];
    return candidates.length === 1 ? candidates[0]!.id : undefined;
  };
}

export function buildProductRecurrenceProfiles(
  products: Product[],
  sessions: PurchaseSession[],
  houseId: string,
) {
  const eligibleProducts = products.filter((product) => product.houseId === houseId);
  const resolveProductId = buildLegacyResolver(eligibleProducts);
  const occurrences = new Map<string, Map<ShoppingUnit, Map<string, string>>>();

  sessions
    .filter((session) => session.status === 'completed' && session.houseId === houseId)
    .forEach((session) => {
      session.items.forEach((item) => {
        if (item.houseId !== houseId) return;
        const productId = resolveProductId(item);
        if (!productId) return;
        const timestamp = item.purchasedAt || session.completedAt || session.startedAt;
        const day = dayNumber(timestamp);
        if (day === undefined) return;
        const units = occurrences.get(productId) ?? new Map();
        const dates = units.get(item.unitSnapshot) ?? new Map<string, string>();
        const dayKey = String(day);
        const current = dates.get(dayKey);
        if (!current || current < timestamp) dates.set(dayKey, timestamp);
        units.set(item.unitSnapshot, dates);
        occurrences.set(productId, units);
      });
    });

  return new Map(
    eligibleProducts.map((product) => {
      const compatibleDates = occurrences.get(product.id)?.get(product.defaultUnit);
      const dates = compatibleDates
        ? [...compatibleDates.entries()]
            .map(([day, timestamp]) => ({ day: Number(day), timestamp }))
            .sort((a, b) => a.day - b.day)
        : [];
      const intervals = dates
        .slice(1)
        .map((entry, index) => entry.day - dates[index]!.day)
        .filter((days) => days > 0);
      const typicalIntervalDays =
        dates.length >= 3 && intervals.length >= 2
          ? Math.max(1, Math.round(median(intervals)))
          : undefined;
      return [
        product.id,
        {
          productId: product.id,
          lastPurchasedAt: dates.at(-1)?.timestamp,
          purchaseCount: dates.length,
          typicalIntervalDays,
          compatibleUnit: product.defaultUnit,
        } satisfies ProductRecurrenceProfile,
      ] as const;
    }),
  );
}

export function buildReplenishmentSuggestions(
  products: Product[],
  sessions: PurchaseSession[],
  shoppingItems: ShoppingListItem[],
  houseId: string,
  now = new Date(),
) {
  const profiles = buildProductRecurrenceProfiles(products, sessions, houseId);
  const listedProductIds = new Set(
    shoppingItems
      .filter((item) => item.houseId === houseId)
      .flatMap((item) => [item.productId, item.houseProductId].filter(Boolean) as string[]),
  );
  const today = Math.floor(now.getTime() / DAY_MS);

  return products
    .filter(
      (product) =>
        product.houseId === houseId && product.active && !listedProductIds.has(product.id),
    )
    .flatMap((product): ReplenishmentSuggestion[] => {
      const profile = profiles.get(product.id);
      if (!profile?.lastPurchasedAt) return [];
      const lastDay = dayNumber(profile.lastPurchasedAt);
      if (lastDay === undefined) return [];
      const manualDays = product.isRecurring ? product.recurrenceDays : undefined;
      const source = manualDays ? 'manual' : 'history';
      const intervalDays = manualDays ?? profile.typicalIntervalDays;
      if (!intervalDays || (source === 'history' && profile.purchaseCount < 3)) return [];
      const daysSinceLastPurchase = Math.max(0, today - lastDay);
      if (daysSinceLastPurchase < intervalDays) return [];
      return [
        {
          ...profile,
          product,
          intervalDays,
          daysSinceLastPurchase,
          overdueDays: daysSinceLastPurchase - intervalDays,
          source,
          reason:
            source === 'manual'
              ? `Recorrência configurada a cada ${intervalDays} dias.`
              : `Você costuma comprar a cada ~${intervalDays} dias.`,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.overdueDays / b.intervalDays - a.overdueDays / a.intervalDays ||
        b.daysSinceLastPurchase - a.daysSinceLastPurchase ||
        a.product.name.localeCompare(b.product.name, 'pt-BR'),
    );
}
