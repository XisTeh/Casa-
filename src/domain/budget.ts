export type HouseBudget = {
  id: string;
  houseId: string;
  year: number;
  month: number;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
};

export function getHouseBudgetId(houseId: string, year: number, month: number) {
  return `${houseId}:${year}-${String(month).padStart(2, '0')}`;
}
