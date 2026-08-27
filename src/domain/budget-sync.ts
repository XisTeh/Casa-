import type { HouseBudget } from './budget';

export type BudgetSyncOutboxEntry = {
  id: string;
  entityType: 'house-budget';
  entityId: string;
  houseId: string;
  actorId: string;
  operation: 'upsert';
  payload: HouseBudget;
  version: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
};
