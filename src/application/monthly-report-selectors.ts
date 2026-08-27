import type { HouseBudget } from '../domain/budget';
import { normalizeCatalogName } from '../domain/catalog';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import {
  buildMonthlySpendingProjection,
  getMonthlySessions,
  shiftMonth,
  type MonthPeriod,
  type SpendingBreakdown,
  type SpendingComparison,
} from './spending-selectors';
import { getCasaeDateParts, getCasaeDayKey } from './casae-date';

export type ProductMonthlyMetric = {
  key: string;
  productId?: string;
  name: string;
  totalCents: number;
  purchaseCount: number;
};

export type PriceChangeHighlight = {
  key: string;
  productId?: string;
  name: string;
  unit: string;
  previousUnitPriceCents: number;
  currentUnitPriceCents: number;
  differenceCents: number;
  percentage: number;
  purchasedAt: string;
};

export type MonthlyEvolutionPoint = MonthPeriod & {
  totalCents: number;
  purchaseCount: number;
};

export type MonthlyReport = {
  period: MonthPeriod;
  totalSpentCents: number;
  budgetAmountCents?: number;
  availableCents?: number;
  budgetPercentage?: number;
  purchaseCount: number;
  averageTicketCents: number;
  largestPurchase?: PurchaseSession;
  smallestPurchase?: PurchaseSession;
  highestSpendingStore?: SpendingBreakdown;
  mostFrequentStore?: SpendingBreakdown;
  highestSpendingCategory?: SpendingBreakdown;
  highestSpendingProduct?: ProductMonthlyMetric;
  mostPurchasedProduct?: ProductMonthlyMetric;
  distinctProductCount: number;
  comparison: SpendingComparison;
  largestPriceDecrease?: PriceChangeHighlight;
  largestPriceIncrease?: PriceChangeHighlight;
  evolution: MonthlyEvolutionPoint[];
};

function sessionDate(session: PurchaseSession) {
  return new Date(session.completedAt ?? session.startedAt);
}

function itemIdentity(item: PurchaseItem) {
  if (item.productId) return `product:${item.productId}`;
  const name = normalizeCatalogName(item.productNameSnapshot);
  const brand = normalizeCatalogName(item.brandSnapshot);
  return name ? `legacy:${name}:${brand}` : undefined;
}

function aggregateProducts(sessions: PurchaseSession[]) {
  const groups = new Map<string, ProductMonthlyMetric & { purchaseSessionIds: Set<string> }>();

  sessions.forEach((session) => {
    session.items.forEach((item) => {
      const key = itemIdentity(item);
      if (!key) return;
      const current = groups.get(key) ?? {
        key,
        productId: item.productId,
        name: item.productNameSnapshot,
        totalCents: 0,
        purchaseCount: 0,
        purchaseSessionIds: new Set<string>(),
      };
      current.totalCents += item.totalPriceCents;
      current.purchaseSessionIds.add(session.id);
      current.purchaseCount = current.purchaseSessionIds.size;
      groups.set(key, current);
    });
  });

  return [...groups.values()].map((group) => ({
    key: group.key,
    productId: group.productId,
    name: group.name,
    totalCents: group.totalCents,
    purchaseCount: group.purchaseCount,
  }));
}

function periodContains(date: Date, period: MonthPeriod) {
  const parts = getCasaeDateParts(date);
  return parts.year === period.year && parts.month === period.month;
}

function getPriceChanges(sessions: PurchaseSession[], period: MonthPeriod) {
  const periodEnd = period.year * 12 + period.month;
  const groups = new Map<string, Array<{ item: PurchaseItem; time: number; day: string }>>();

  sessions
    .filter((session) => {
      const date = getCasaeDateParts(sessionDate(session));
      return session.status === 'completed' && date.year * 12 + date.month <= periodEnd;
    })
    .forEach((session) => {
      session.items.forEach((item) => {
        const identity = itemIdentity(item);
        if (!identity || item.unitPriceCents <= 0) return;
        const time = new Date(item.purchasedAt).getTime();
        if (!Number.isFinite(time)) return;
        const key = `${identity}:unit:${item.unitSnapshot}`;
        const values = groups.get(key) ?? [];
        values.push({ item, time, day: getCasaeDayKey(new Date(time)) });
        groups.set(key, values);
      });
    });

  const changes: PriceChangeHighlight[] = [];
  groups.forEach((observations, key) => {
    const byDay = new Map<string, (typeof observations)[number]>();
    observations
      .sort((a, b) => a.time - b.time)
      .forEach((observation) => byDay.set(observation.day, observation));
    const distinct = [...byDay.values()].sort((a, b) => a.time - b.time);
    let currentIndex = -1;
    distinct.forEach((entry, index) => {
      if (periodContains(new Date(entry.time), period)) currentIndex = index;
    });
    if (currentIndex <= 0) return;
    const current = distinct[currentIndex]!;
    const previous = distinct[currentIndex - 1]!;
    if (previous.item.unitPriceCents <= 0) return;
    const differenceCents = current.item.unitPriceCents - previous.item.unitPriceCents;
    if (differenceCents === 0) return;
    changes.push({
      key,
      productId: current.item.productId,
      name: current.item.productNameSnapshot,
      unit: current.item.unitSnapshot,
      previousUnitPriceCents: previous.item.unitPriceCents,
      currentUnitPriceCents: current.item.unitPriceCents,
      differenceCents,
      percentage: (differenceCents / previous.item.unitPriceCents) * 100,
      purchasedAt: current.item.purchasedAt,
    });
  });
  return changes;
}

export function buildMonthlyReport(
  sessions: PurchaseSession[],
  budgets: HouseBudget[],
  period: MonthPeriod,
): MonthlyReport {
  const projection = buildMonthlySpendingProjection(sessions, budgets, period);
  const monthlySessions = getMonthlySessions(sessions, period);
  const sortedPurchases = [...monthlySessions].sort(
    (a, b) =>
      b.totalPriceCents - a.totalPriceCents || sessionDate(b).getTime() - sessionDate(a).getTime(),
  );
  const products = aggregateProducts(monthlySessions);
  const bySpend = [...products].sort(
    (a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'),
  );
  const byFrequency = [...products].sort(
    (a, b) =>
      b.purchaseCount - a.purchaseCount ||
      b.totalCents - a.totalCents ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
  const byStoreFrequency = [...projection.stores].sort(
    (a, b) =>
      (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0) ||
      b.totalCents - a.totalCents ||
      a.name.localeCompare(b.name, 'pt-BR'),
  );
  const priceChanges = getPriceChanges(sessions, period);

  return {
    period,
    totalSpentCents: projection.totalSpentCents,
    budgetAmountCents: projection.budgetAmountCents,
    availableCents: projection.availableCents,
    budgetPercentage: projection.budgetPercentage,
    purchaseCount: projection.purchaseCount,
    averageTicketCents:
      projection.purchaseCount > 0
        ? Math.round(projection.totalSpentCents / projection.purchaseCount)
        : 0,
    largestPurchase: sortedPurchases[0],
    smallestPurchase: sortedPurchases.at(-1),
    highestSpendingStore: projection.stores[0],
    mostFrequentStore: byStoreFrequency[0],
    highestSpendingCategory: projection.categories[0],
    highestSpendingProduct: bySpend[0],
    mostPurchasedProduct: byFrequency[0],
    distinctProductCount: products.length,
    comparison: projection.comparison,
    largestPriceDecrease: [...priceChanges]
      .filter((change) => change.differenceCents < 0)
      .sort((a, b) => a.differenceCents - b.differenceCents)[0],
    largestPriceIncrease: [...priceChanges]
      .filter((change) => change.differenceCents > 0)
      .sort((a, b) => b.differenceCents - a.differenceCents)[0],
    evolution: Array.from({ length: 6 }, (_, index) => shiftMonth(period, index - 5)).map(
      (candidate) => {
        const monthly = getMonthlySessions(sessions, candidate);
        return {
          ...candidate,
          totalCents: monthly.reduce((total, session) => total + session.totalPriceCents, 0),
          purchaseCount: monthly.length,
        };
      },
    ),
  };
}
