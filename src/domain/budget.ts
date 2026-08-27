export type HouseBudget = {
  id: string;
  /** UUID remoto; o ID local por Casa/mês continua estável. */
  syncId?: string;
  houseId: string;
  year: number;
  month: number;
  amountCents: number;
  createdById?: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
};

export function getHouseBudgetId(houseId: string, year: number, month: number) {
  return `${houseId}:${year}-${String(month).padStart(2, '0')}`;
}
