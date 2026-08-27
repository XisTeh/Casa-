import { createContext, useContext } from 'react';
import type {
  ManualPurchaseItemInput,
  PurchaseEntryMode,
  PurchaseSession,
} from '../../domain/purchase';
import type { ShoppingListItem, ShoppingSyncStatus } from '../../domain/shopping-list';
import type { Store } from '../../domain/store';

export type PurchaseContextValue = {
  activeSession: PurchaseSession | null;
  activeSessions: PurchaseSession[];
  completedSessions: PurchaseSession[];
  latestCompletedSession: PurchaseSession | null;
  isOwner: boolean;
  isLoading: boolean;
  error: string | null;
  syncStatus: ShoppingSyncStatus;
  startPurchase: (
    store: Pick<Store, 'id' | 'name'>,
    entryMode?: PurchaseEntryMode,
    startAnother?: boolean,
  ) => Promise<PurchaseSession>;
  watchPurchase: (sessionId: string) => Promise<void>;
  leavePurchase: () => void;
  markPurchased: (
    item: ShoppingListItem,
    purchasedQuantity: number,
    unitPriceCents: number,
  ) => Promise<PurchaseSession>;
  undoPurchasedItem: (sourceShoppingItemId: string) => Promise<PurchaseSession>;
  addManualItem: (input: ManualPurchaseItemInput) => Promise<PurchaseSession>;
  updateManualItem: (itemId: string, input: ManualPurchaseItemInput) => Promise<PurchaseSession>;
  removePurchaseItem: (itemId: string) => Promise<PurchaseSession>;
  cancelPurchase: () => Promise<PurchaseSession>;
  completePurchase: () => Promise<PurchaseSession>;
};

export const purchaseContext = createContext<PurchaseContextValue | null>(null);

export function usePurchase() {
  const context = useContext(purchaseContext);
  if (!context) throw new Error('usePurchase deve ser usado dentro de PurchaseProvider.');
  return context;
}
