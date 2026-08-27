import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import { getCasaeDateParts, getCasaeDayOrdinal } from './casae-date';

export type HistoryPeriod = 'all' | '30-days' | '90-days' | 'current-year';

export type HistoryFilters = {
  period: HistoryPeriod;
  storeId: string;
  buyer: string;
  query: string;
};

export type HistorySummary = {
  purchaseCount: number;
  totalSpentCents: number;
  averageSpentCents: number;
};

export type PurchaseMonthGroup = {
  key: string;
  date: string;
  sessions: PurchaseSession[];
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function sessionDate(session: PurchaseSession) {
  return session.completedAt ?? session.startedAt;
}

export function filterPurchaseHistory(
  sessions: PurchaseSession[],
  filters: HistoryFilters,
  now = new Date(),
) {
  const query = normalize(filters.query);
  const today = getCasaeDayOrdinal(now);
  const currentYear = getCasaeDateParts(now).year;

  return sessions.filter((session) => {
    const sessionParts = getCasaeDateParts(sessionDate(session));
    const ageInDays = today - getCasaeDayOrdinal(sessionDate(session));
    if (filters.period === '30-days' && ageInDays > 30) return false;
    if (filters.period === '90-days' && ageInDays > 90) return false;
    if (filters.period === 'current-year' && sessionParts.year !== currentYear) return false;
    if (filters.storeId && session.storeId !== filters.storeId) return false;
    if (filters.buyer && session.purchasedByNameSnapshot !== filters.buyer) return false;
    if (
      query &&
      !session.items.some((item) => normalize(item.productNameSnapshot).includes(query))
    ) {
      return false;
    }
    return true;
  });
}

export function summarizePurchaseHistory(sessions: PurchaseSession[]): HistorySummary {
  const totalSpentCents = sessions.reduce((total, session) => total + session.totalPriceCents, 0);
  return {
    purchaseCount: sessions.length,
    totalSpentCents,
    averageSpentCents: sessions.length ? Math.round(totalSpentCents / sessions.length) : 0,
  };
}

export function groupPurchasesByMonth(sessions: PurchaseSession[]): PurchaseMonthGroup[] {
  const groups = new Map<string, PurchaseMonthGroup>();
  [...sessions]
    .sort((first, second) => sessionDate(second).localeCompare(sessionDate(first)))
    .forEach((session) => {
      const date = sessionDate(session);
      const parsedDate = getCasaeDateParts(date);
      const key = `${parsedDate.year}-${String(parsedDate.month).padStart(2, '0')}`;
      const group = groups.get(key) ?? { key, date, sessions: [] };
      group.sessions.push(session);
      groups.set(key, group);
    });
  return [...groups.values()];
}

export function getPurchaseItemIdentity(item: PurchaseItem) {
  return item.productId?.startsWith('legacy-name:')
    ? item.productId
    : item.productId
      ? `product:${item.productId}`
      : `legacy-name:${normalize(item.productNameSnapshot)}`;
}

export type ProductPriceStats = {
  identity: string;
  latestItem: PurchaseItem;
  items: PurchaseItem[];
  latestPriceCents: number;
  lowestPriceCents: number;
  highestPriceCents: number;
  averagePriceCents: number;
  stores: Array<{ id?: string; name: string }>;
};

export function getProductPriceHistory(
  sessions: PurchaseSession[],
  identity: string,
): ProductPriceStats | null {
  const items = sessions
    .flatMap((session) => session.items)
    .filter((item) => getPurchaseItemIdentity(item) === identity)
    .sort((first, second) => second.purchasedAt.localeCompare(first.purchasedAt));
  const latestItem = items[0];
  if (!latestItem) return null;
  const prices = items.map((item) => item.unitPriceCents);
  const stores = new Map<string, { id?: string; name: string }>();
  items.forEach((item) =>
    stores.set(item.storeId ?? `legacy:${normalize(item.storeNameSnapshot)}`, {
      id: item.storeId,
      name: item.storeNameSnapshot,
    }),
  );
  return {
    identity,
    latestItem,
    items,
    latestPriceCents: latestItem.unitPriceCents,
    lowestPriceCents: Math.min(...prices),
    highestPriceCents: Math.max(...prices),
    averagePriceCents: Math.round(
      prices.reduce((total, price) => total + price, 0) / prices.length,
    ),
    stores: [...stores.values()],
  };
}
