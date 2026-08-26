import type { HouseBudget } from '../../domain/budget';
import type { BudgetRepository } from '../../domain/budget-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

const clone = (budget: HouseBudget): HouseBudget => ({ ...budget });

export class LocalBudgetRepository implements BudgetRepository {
  readonly database: CasaeLocalDatabase;

  constructor(database: CasaeLocalDatabase | string = new CasaeLocalDatabase()) {
    this.database =
      typeof database === 'string'
        ? new CasaeLocalDatabase(database, { migrateLegacy: false })
        : database;
  }

  initialize() {
    return this.database.initialize();
  }

  async list(houseId: string) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      return [...this.database.getMemoryDatabase().houseBudgets.values()]
        .filter((budget) => budget.houseId === houseId)
        .map(clone)
        .sort((a, b) => b.year - a.year || b.month - a.month);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.houseBudgets, 'readonly');
    const budgets = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.houseBudgets)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<HouseBudget[]>,
    );
    await transactionToPromise(transaction);
    return budgets.map(clone).sort((a, b) => b.year - a.year || b.month - a.month);
  }

  async getByMonth(houseId: string, year: number, month: number) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const budget = [...this.database.getMemoryDatabase().houseBudgets.values()].find(
        (candidate) =>
          candidate.houseId === houseId && candidate.year === year && candidate.month === month,
      );
      return budget ? clone(budget) : undefined;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.houseBudgets, 'readonly');
    const budget = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.houseBudgets)
        .index('houseYearMonth')
        .get([houseId, year, month]) as IDBRequest<HouseBudget | undefined>,
    );
    await transactionToPromise(transaction);
    return budget ? clone(budget) : undefined;
  }

  async save(budget: HouseBudget) {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      this.database.getMemoryDatabase().houseBudgets.set(budget.id, clone(budget));
      return clone(budget);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.houseBudgets, 'readwrite');
    transaction.objectStore(CASAE_STORES.houseBudgets).put(budget);
    await transactionToPromise(transaction);
    return clone(budget);
  }
}
