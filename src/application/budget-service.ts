import { getHouseBudgetId, type HouseBudget } from '../domain/budget';
import type { BudgetRepository } from '../domain/budget-repository';
import { isBudgetSyncRepository } from '../domain/budget-repository';
import type { ShoppingSyncStatus } from '../domain/shopping-list';
import { HOUSE_ID } from '../domain/shopping-list';

export class BudgetService {
  constructor(private readonly repository: BudgetRepository) {}

  async list(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.list(houseId);
  }

  subscribe(
    houseId: string,
    onChanged: () => void,
    onStatusChanged?: (status: ShoppingSyncStatus) => void,
  ) {
    return isBudgetSyncRepository(this.repository)
      ? this.repository.subscribe(houseId, onChanged, onStatusChanged)
      : () => undefined;
  }

  async syncNow(houseId: string) {
    if (isBudgetSyncRepository(this.repository)) await this.repository.syncNow(houseId);
  }

  async getStatus(houseId: string): Promise<ShoppingSyncStatus> {
    return isBudgetSyncRepository(this.repository)
      ? this.repository.getStatus(houseId)
      : { state: 'local', pending: 0 };
  }

  async setMonthlyBudget(year: number, month: number, amountCents: number, houseId = HOUSE_ID) {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new Error('Informe um ano válido.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('Informe um mês válido.');
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('O orçamento precisa ser maior que zero.');
    }
    await this.repository.initialize();
    const existing = await this.repository.getByMonth(houseId, year, month);
    const currentTime = Date.now();
    const previousTime = existing ? new Date(existing.updatedAt).getTime() : 0;
    const now = new Date(Math.max(currentTime, previousTime + 1)).toISOString();
    const budget: HouseBudget = {
      ...existing,
      id: existing?.id ?? getHouseBudgetId(houseId, year, month),
      houseId,
      year,
      month,
      amountCents,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return this.repository.save(budget);
  }
}
