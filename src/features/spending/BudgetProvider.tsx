import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BudgetService } from '../../application/budget-service';
import { defaultBudgetService } from '../../app/app-services';
import type { HouseBudget } from '../../domain/budget';
import { budgetContext } from './BudgetContext';
import { useHousehold } from '../house/HouseContext';

export function BudgetProvider({
  children,
  service = defaultBudgetService,
}: {
  children: ReactNode;
  service?: BudgetService;
}) {
  const { activeHouse } = useHousehold();
  const [budgets, setBudgets] = useState<HouseBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    service
      .list(activeHouse.id)
      .then((saved) => {
        if (current) {
          setBudgets(saved);
          setError(null);
        }
      })
      .catch(() => current && setError('Não foi possível abrir os orçamentos locais.'))
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
    };
  }, [activeHouse.id, service]);

  const setMonthlyBudget = useCallback(
    async (year: number, month: number, amountCents: number) => {
      const saved = await service.setMonthlyBudget(year, month, amountCents, activeHouse.id);
      setBudgets((current) =>
        [saved, ...current.filter((budget) => budget.id !== saved.id)].sort(
          (a, b) => b.year - a.year || b.month - a.month,
        ),
      );
      setError(null);
    },
    [activeHouse.id, service],
  );

  const value = useMemo(
    () => ({ budgets, isLoading, error, setMonthlyBudget }),
    [budgets, error, isLoading, setMonthlyBudget],
  );
  return <budgetContext.Provider value={value}>{children}</budgetContext.Provider>;
}
