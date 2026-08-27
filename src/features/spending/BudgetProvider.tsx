import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BudgetService } from '../../application/budget-service';
import { defaultBudgetService } from '../../app/app-services';
import type { HouseBudget } from '../../domain/budget';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
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
  const [syncStatus, setSyncStatus] = useState<ShoppingSyncStatus>({ state: 'local', pending: 0 });

  const refreshBudgets = useCallback(async () => {
    const saved = await service.list(activeHouse.id);
    setBudgets(saved);
    setError(null);
  }, [activeHouse.id, service]);

  useEffect(() => {
    let current = true;
    const unsubscribe = service.subscribe(
      activeHouse.id,
      () => void refreshBudgets(),
      (status) => current && setSyncStatus(status),
    );
    service
      .syncNow(activeHouse.id)
      .then(refreshBudgets)
      .catch(() => current && setError('Não foi possível abrir os orçamentos locais.'))
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
      unsubscribe();
    };
  }, [activeHouse.id, refreshBudgets, service]);

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
    () => ({ budgets, isLoading, error, syncStatus, setMonthlyBudget }),
    [budgets, error, isLoading, setMonthlyBudget, syncStatus],
  );
  return <budgetContext.Provider value={value}>{children}</budgetContext.Provider>;
}
