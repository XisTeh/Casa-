import { describe, expect, it } from 'vitest';
import { BudgetService } from '../application/budget-service';
import { HOUSE_ID } from '../domain/shopping-list';
import { LocalBudgetRepository } from '../infrastructure/budget/LocalBudgetRepository';
import {
  CasaeLocalDatabase,
  CASAE_DATABASE_VERSION,
} from '../infrastructure/local-database/CasaeLocalDatabase';

describe('orçamento mensal local', () => {
  it('persiste por Casa/mês, edita sem duplicar e mantém timestamps', async () => {
    const database = new CasaeLocalDatabase(`casae-test-budget-${Date.now()}-${Math.random()}`, {
      migrateLegacy: false,
    });
    const repository = new LocalBudgetRepository(database);
    const service = new BudgetService(repository);
    const first = await service.setMonthlyBudget(2026, 8, 150_000);
    const edited = await service.setMonthlyBudget(2026, 8, 180_000);
    await service.setMonthlyBudget(2026, 9, 200_000);
    expect(first).toMatchObject({ houseId: HOUSE_ID, year: 2026, month: 8, amountCents: 150_000 });
    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe(first.createdAt);
    expect(await service.list()).toHaveLength(2);
    expect(await repository.getByMonth(HOUSE_ID, 2026, 8)).toMatchObject({ amountCents: 180_000 });
    expect(CASAE_DATABASE_VERSION).toBe(6);
  });

  it('rejeita orçamento zero, negativo e mês inválido', async () => {
    const service = new BudgetService(
      new LocalBudgetRepository(`casae-test-budget-invalid-${Date.now()}-${Math.random()}`),
    );
    await expect(service.setMonthlyBudget(2026, 8, 0)).rejects.toThrow(/maior que zero/i);
    await expect(service.setMonthlyBudget(2026, 8, -1)).rejects.toThrow(/maior que zero/i);
    await expect(service.setMonthlyBudget(2026, 13, 100)).rejects.toThrow(/mês válido/i);
  });
});
