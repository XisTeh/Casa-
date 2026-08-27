import type { HouseBudget } from '../domain/budget';
import type { PurchaseItem, PurchaseSession } from '../domain/purchase';
import { shoppingCategoryLabels } from '../domain/shopping-list';
import { normalizeCatalogName } from '../domain/catalog';
import { getCasaeDateParts } from './casae-date';

export type MonthPeriod = { year: number; month: number };
export type SpendingComparison = {
  previousTotalCents: number;
  differenceCents: number;
  percentage?: number;
  trend: 'increase' | 'decrease' | 'stable' | 'unavailable';
};
export type SpendingBreakdown = {
  key: string;
  name: string;
  totalCents: number;
  percentage: number;
  purchaseCount?: number;
};
export type CumulativeSpendingPoint = {
  day: number;
  date: string;
  dailyTotalCents: number;
  cumulativeTotalCents: number;
};
export type BudgetProgressStatus = 'none' | 'normal' | 'moderate' | 'warning' | 'exceeded';

export type MonthlySpendingProjection = {
  period: MonthPeriod;
  sessions: PurchaseSession[];
  totalSpentCents: number;
  purchaseCount: number;
  comparison: SpendingComparison;
  budget?: HouseBudget;
  budgetAmountCents?: number;
  availableCents?: number;
  budgetPercentage?: number;
  budgetStatus: BudgetProgressStatus;
  categories: SpendingBreakdown[];
  stores: SpendingBreakdown[];
  largestPurchases: PurchaseSession[];
  cumulativeSeries: CumulativeSpendingPoint[];
  previousCumulativeSeries: CumulativeSpendingPoint[];
  daysRemaining?: number;
  dailyAvailableCents?: number;
};

export function getCurrentMonth(date = new Date()): MonthPeriod {
  const { year, month } = getCasaeDateParts(date);
  return { year, month };
}

export function shiftMonth(period: MonthPeriod, offset: number): MonthPeriod {
  const date = new Date(Date.UTC(period.year, period.month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function parseMonthPeriod(value: string | null, fallback = getCurrentMonth()): MonthPeriod {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return fallback;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function serializeMonthPeriod(period: MonthPeriod) {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

function sessionDate(session: PurchaseSession) {
  return new Date(session.completedAt ?? session.startedAt);
}

function isInPeriod(session: PurchaseSession, period: MonthPeriod) {
  if (session.status !== 'completed') return false;
  const date = getCasaeDateParts(sessionDate(session));
  return date.year === period.year && date.month === period.month;
}

export function getMonthlySessions(sessions: PurchaseSession[], period: MonthPeriod) {
  return sessions
    .filter((session) => isInPeriod(session, period))
    .sort((a, b) => sessionDate(b).getTime() - sessionDate(a).getTime());
}

export function getMonthlySpending(sessions: PurchaseSession[], period: MonthPeriod) {
  return getMonthlySessions(sessions, period).reduce(
    (total, session) => total + session.totalPriceCents,
    0,
  );
}

export function getPreviousMonthComparison(
  sessions: PurchaseSession[],
  period: MonthPeriod,
): SpendingComparison {
  const currentTotal = getMonthlySpending(sessions, period);
  const previousTotalCents = getMonthlySpending(sessions, shiftMonth(period, -1));
  const differenceCents = currentTotal - previousTotalCents;
  if (previousTotalCents <= 0) {
    return {
      previousTotalCents,
      differenceCents,
      trend: currentTotal === 0 ? 'stable' : 'unavailable',
    };
  }
  return {
    previousTotalCents,
    differenceCents,
    percentage: (differenceCents / previousTotalCents) * 100,
    trend: differenceCents > 0 ? 'increase' : differenceCents < 0 ? 'decrease' : 'stable',
  };
}

function categoryName(item: PurchaseItem) {
  return (
    item.categoryNameSnapshot?.trim() || shoppingCategoryLabels[item.categorySnapshot] || 'Outros'
  );
}

export function getCategoryBreakdown(sessions: PurchaseSession[], period: MonthPeriod) {
  const monthly = getMonthlySessions(sessions, period);
  const totalCents = monthly.reduce((total, session) => total + session.totalPriceCents, 0);
  const groups = new Map<string, { name: string; totalCents: number }>();
  monthly
    .flatMap((session) => session.items)
    .forEach((item) => {
      const name = categoryName(item);
      const key = normalizeCatalogName(name) || 'outros';
      const current = groups.get(key) ?? { name, totalCents: 0 };
      current.totalCents += item.totalPriceCents;
      groups.set(key, current);
    });
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      name: group.name,
      totalCents: group.totalCents,
      percentage: totalCents > 0 ? (group.totalCents / totalCents) * 100 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'));
}

export function getStoreBreakdown(sessions: PurchaseSession[], period: MonthPeriod) {
  const monthly = getMonthlySessions(sessions, period);
  const totalCents = monthly.reduce((total, session) => total + session.totalPriceCents, 0);
  const groups = new Map<string, { name: string; totalCents: number; purchaseCount: number }>();
  monthly.forEach((session) => {
    const key = session.storeId ?? `legacy:${normalizeCatalogName(session.storeNameSnapshot)}`;
    const current = groups.get(key) ?? {
      name: session.storeNameSnapshot || 'Mercado não informado',
      totalCents: 0,
      purchaseCount: 0,
    };
    current.totalCents += session.totalPriceCents;
    current.purchaseCount += 1;
    groups.set(key, current);
  });
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      ...group,
      percentage: totalCents > 0 ? (group.totalCents / totalCents) * 100 : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'));
}

export function getLargestPurchases(sessions: PurchaseSession[], period: MonthPeriod, limit = 5) {
  return getMonthlySessions(sessions, period)
    .sort(
      (a, b) =>
        b.totalPriceCents - a.totalPriceCents ||
        sessionDate(b).getTime() - sessionDate(a).getTime(),
    )
    .slice(0, limit);
}

export function getMonthlyCumulativeSeries(
  sessions: PurchaseSession[],
  period: MonthPeriod,
): CumulativeSpendingPoint[] {
  const daily = new Map<number, { date: string; totalCents: number }>();
  getMonthlySessions(sessions, period).forEach((session) => {
    const date = getCasaeDateParts(sessionDate(session));
    const day = date.day;
    const current = daily.get(day) ?? {
      date: session.completedAt ?? session.startedAt,
      totalCents: 0,
    };
    current.totalCents += session.totalPriceCents;
    daily.set(day, current);
  });
  let cumulativeTotalCents = 0;
  return [...daily.entries()]
    .sort(([dayA], [dayB]) => dayA - dayB)
    .map(([day, value]) => {
      cumulativeTotalCents += value.totalCents;
      return {
        day,
        date: value.date,
        dailyTotalCents: value.totalCents,
        cumulativeTotalCents,
      };
    });
}

export function getBudgetProgress(totalSpentCents: number, budget?: HouseBudget) {
  if (!budget) {
    return {
      budgetStatus: 'none' as const,
      budgetAmountCents: undefined,
      availableCents: undefined,
      budgetPercentage: undefined,
    };
  }
  const percentage = (totalSpentCents / budget.amountCents) * 100;
  const status: BudgetProgressStatus =
    percentage >= 100
      ? 'exceeded'
      : percentage >= 85
        ? 'warning'
        : percentage >= 70
          ? 'moderate'
          : 'normal';
  return {
    budgetStatus: status,
    budgetAmountCents: budget.amountCents,
    availableCents: budget.amountCents - totalSpentCents,
    budgetPercentage: percentage,
  };
}

export function buildMonthlySpendingProjection(
  sessions: PurchaseSession[],
  budgets: HouseBudget[],
  period: MonthPeriod,
  now = new Date(),
): MonthlySpendingProjection {
  const monthlySessions = getMonthlySessions(sessions, period);
  const totalSpentCents = monthlySessions.reduce(
    (total, session) => total + session.totalPriceCents,
    0,
  );
  const budget = budgets.find(
    (candidate) => candidate.year === period.year && candidate.month === period.month,
  );
  const budgetProgress = getBudgetProgress(totalSpentCents, budget);
  const current = getCurrentMonth(now);
  const isCurrent = current.year === period.year && current.month === period.month;
  const daysRemaining = isCurrent
    ? new Date(Date.UTC(period.year, period.month, 0)).getUTCDate() - getCasaeDateParts(now).day
    : undefined;
  const dailyAvailableCents =
    daysRemaining !== undefined && daysRemaining > 0 && budgetProgress.availableCents !== undefined
      ? Math.max(0, Math.floor(budgetProgress.availableCents / daysRemaining))
      : undefined;

  return {
    period,
    sessions: monthlySessions,
    totalSpentCents,
    purchaseCount: monthlySessions.length,
    comparison: getPreviousMonthComparison(sessions, period),
    budget,
    ...budgetProgress,
    categories: getCategoryBreakdown(sessions, period),
    stores: getStoreBreakdown(sessions, period),
    largestPurchases: getLargestPurchases(sessions, period),
    cumulativeSeries: getMonthlyCumulativeSeries(sessions, period),
    previousCumulativeSeries: getMonthlyCumulativeSeries(sessions, shiftMonth(period, -1)),
    daysRemaining,
    dailyAvailableCents,
  };
}
