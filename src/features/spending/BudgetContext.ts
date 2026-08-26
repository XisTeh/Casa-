import { createContext, useContext } from 'react';
import type { HouseBudget } from '../../domain/budget';

export type BudgetContextValue = {
  budgets: HouseBudget[];
  isLoading: boolean;
  error: string | null;
  setMonthlyBudget: (year: number, month: number, amountCents: number) => Promise<void>;
};

export const budgetContext = createContext<BudgetContextValue | null>(null);

export function useBudgets() {
  const context = useContext(budgetContext);
  if (!context) throw new Error('useBudgets deve ser usado dentro de BudgetProvider.');
  return context;
}
