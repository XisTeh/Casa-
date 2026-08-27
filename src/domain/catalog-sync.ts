import type { ShoppingSyncStatus } from './shopping-list';

export type CatalogEntityType = 'category' | 'product' | 'store';

export type CatalogSyncOutboxEntry = {
  id: string;
  entityType: CatalogEntityType;
  entityId: string;
  houseId: string;
  actorId: string;
  operation: 'upsert' | 'delete';
  payload: unknown;
  version: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
};

export interface CatalogSyncRepository {
  subscribe(
    houseId: string,
    onChanged: () => void,
    onStatusChanged?: (status: ShoppingSyncStatus) => void,
  ): () => void;
  syncNow(houseId: string): Promise<void>;
  getStatus(houseId: string): Promise<ShoppingSyncStatus>;
}

export function isCatalogSyncRepository(value: object): value is object & CatalogSyncRepository {
  return 'syncNow' in value && 'subscribe' in value;
}
