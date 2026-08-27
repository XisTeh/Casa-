import type { PersistedPurchaseSession, PurchaseItem } from './purchase';
import type { ShoppingSyncStatus } from './shopping-list';

export type PurchaseSyncEntityType = 'purchase-session' | 'purchase-item';

export type PurchaseSyncOutboxEntry = {
  id: string;
  entityType: PurchaseSyncEntityType;
  entityId: string;
  houseId: string;
  actorId: string;
  operation: 'upsert' | 'delete';
  payload: PersistedPurchaseSession | PurchaseItem;
  version: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
};

export type LegacyPurchaseMigration = {
  sessions: number;
  items: number;
  importIntoHouse(): Promise<void>;
};

export interface PurchaseSyncRepository {
  subscribe(
    houseId: string,
    onChanged: () => void,
    onStatusChanged?: (status: ShoppingSyncStatus) => void,
  ): () => void;
  syncNow(houseId: string): Promise<void>;
  getStatus(houseId: string): Promise<ShoppingSyncStatus>;
  getLegacyMigration(houseId: string): Promise<LegacyPurchaseMigration | null>;
}

export function isPurchaseSyncRepository(value: object): value is object & PurchaseSyncRepository {
  return (
    'syncNow' in value &&
    'subscribe' in value &&
    'getStatus' in value &&
    'getLegacyMigration' in value
  );
}
