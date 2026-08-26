import { getHouseBudgetId, type HouseBudget } from '../domain/budget';
import type { BudgetRepository } from '../domain/budget-repository';
import { HOUSE_ID } from '../domain/shopping-list';

export class BudgetService {
  constructor(private readonly repository: BudgetRepository) {}

  async list(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.list(houseId);
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
    const now = new Date().toISOString();
    const budget: HouseBudget = {
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
