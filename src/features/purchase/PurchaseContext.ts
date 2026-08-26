import { createContext, useContext } from 'react';
import type {
  ManualPurchaseItemInput,
  PurchaseEntryMode,
  PurchaseSession,
} from '../../domain/purchase';
import type { ShoppingListItem } from '../../domain/shopping-list';
import type { Store } from '../../domain/store';

export type PurchaseContextValue = {
  activeSession: PurchaseSession | null;
  completedSessions: PurchaseSession[];
  latestCompletedSession: PurchaseSession | null;
  isLoading: boolean;
  error: string | null;
  startPurchase: (
    store: Pick<Store, 'id' | 'name'>,
    entryMode?: PurchaseEntryMode,
  ) => Promise<PurchaseSession>;
  markPurchased: (
    item: ShoppingListItem,
    purchasedQuantity: number,
    unitPriceCents: number,
  ) => Promise<PurchaseSession>;
  undoPurchasedItem: (sourceShoppingItemId: string) => Promise<PurchaseSession>;
  addManualItem: (input: ManualPurchaseItemInput) => Promise<PurchaseSession>;
  updateManualItem: (itemId: string, input: ManualPurchaseItemInput) => Promise<PurchaseSession>;
  removePurchaseItem: (itemId: string) => Promise<PurchaseSession>;
  cancelPurchase: () => Promise<void>;
  completePurchase: () => Promise<PurchaseSession>;
};

export const purchaseContext = createContext<PurchaseContextValue | null>(null);

export function usePurchase() {
  const context = useContext(purchaseContext);

  if (!context) {
    throw new Error('usePurchase deve ser usado dentro de PurchaseProvider.');
  }

  return context;
}
