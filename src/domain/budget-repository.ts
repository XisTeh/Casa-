import type { HouseBudget } from './budget';

export interface BudgetRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<HouseBudget[]>;
  getByMonth(houseId: string, year: number, month: number): Promise<HouseBudget | undefined>;
  save(budget: HouseBudget): Promise<HouseBudget>;
}
