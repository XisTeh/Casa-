import type { PersistedPurchaseSession, PurchaseItem, PurchaseSession } from './purchase';

export interface PurchaseRepository {
  initialize(): Promise<void>;
  getActiveSession(houseId: string): Promise<PurchaseSession | null>;
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
  cancelSession(houseId: string, sessionId: string): Promise<void>;
  listCompletedSessions(houseId: string): Promise<PurchaseSession[]>;
}
