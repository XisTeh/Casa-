import type { PersistedPurchaseSession, PurchaseItem, PurchaseSession } from './purchase';

export interface PurchaseRepository {
  initialize(): Promise<void>;
  getActiveSession(houseId: string): Promise<PurchaseSession | null>;
  getSession(houseId: string, sessionId: string): Promise<PurchaseSession | null>;
  listActiveSessions(houseId: string): Promise<PurchaseSession[]>;
  createSession(session: PersistedPurchaseSession): Promise<PurchaseSession>;
  savePurchasedItem(houseId: string, item: PurchaseItem): Promise<PurchaseSession>;
  removePurchasedItem(
    houseId: string,
    sessionId: string,
    purchaseItemId: string,
  ): Promise<PurchaseSession>;
  completeSession(
    houseId: string,
    sessionId: string,
    completedAt: string,
    totalPriceCents: number,
    purchasedShoppingItemIds: string[],
  ): Promise<PurchaseSession>;
  cancelSession(houseId: string, sessionId: string, cancelledAt?: string): Promise<PurchaseSession>;
  listCompletedSessions(houseId: string): Promise<PurchaseSession[]>;
}
