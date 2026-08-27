import type { HouseBudget } from './budget';
import type { ShoppingSyncStatus } from './shopping-list';

export interface BudgetRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<HouseBudget[]>;
  getByMonth(houseId: string, year: number, month: number): Promise<HouseBudget | undefined>;
  save(budget: HouseBudget): Promise<HouseBudget>;
}

export interface BudgetSyncRepository {
  subscribe(
    houseId: string,
    onChanged: () => void,
    onStatusChanged?: (status: ShoppingSyncStatus) => void,
  ): () => void;
  syncNow(houseId: string): Promise<void>;
  getStatus(houseId: string): Promise<ShoppingSyncStatus>;
}

export function isBudgetSyncRepository(
  repository: BudgetRepository,
): repository is BudgetRepository & BudgetSyncRepository {
  return 'syncNow' in repository && 'subscribe' in repository && 'getStatus' in repository;
}
