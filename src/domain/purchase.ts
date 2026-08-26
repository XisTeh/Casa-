import type { ShoppingCategory, ShoppingPriority, ShoppingUnit } from './shopping-list';

export const PURCHASE_SESSION_STATUSES = ['active', 'completed', 'cancelled'] as const;
export const PURCHASE_ENTRY_MODES = ['list', 'quick'] as const;
export const PURCHASE_ITEM_ORIGINS = ['shopping-list', 'manual'] as const;

export type PurchaseSessionStatus = (typeof PURCHASE_SESSION_STATUSES)[number];
export type PurchaseEntryMode = (typeof PURCHASE_ENTRY_MODES)[number];
export type PurchaseItemOrigin = (typeof PURCHASE_ITEM_ORIGINS)[number];

export type ManualPurchaseItemInput = {
  productName: string;
  productId?: string;
  brand?: string;
  category?: ShoppingCategory;
  categoryName?: string;
  quantity: number;
  unit: ShoppingUnit;
  unitPriceCents: number;
};

export type PurchaseItem = {
  id: string;
  /** UUID remoto; IDs locais legados continuam estáveis. */
  syncId?: string;
  houseId: string;
  purchaseSessionId: string;
  origin?: PurchaseItemOrigin;
  sourceShoppingItemId?: string;
  productId?: string;
  productNameSnapshot: string;
  brandSnapshot: string;
  categorySnapshot: ShoppingCategory;
  categoryNameSnapshot?: string;
  prioritySnapshot: ShoppingPriority;
  notesSnapshot: string;
  plannedQuantity: number;
  purchasedQuantity: number;
  unitSnapshot: ShoppingUnit;
  unitPriceCents: number;
  totalPriceCents: number;
  storeId?: string;
  storeNameSnapshot: string;
  purchasedById?: string;
  purchasedByNameSnapshot: string;
  purchasedAt: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export type PurchaseSession = {
  id: string;
  /** UUID remoto; IDs locais legados continuam estáveis. */
  syncId?: string;
  houseId: string;
  storeId?: string;
  storeNameSnapshot: string;
  entryMode?: PurchaseEntryMode;
  status: PurchaseSessionStatus;
  startedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  purchasedById?: string;
  purchasedByNameSnapshot: string;
  totalPriceCents: number;
  updatedAt?: string;
  deletedAt?: string;
  items: PurchaseItem[];
};

export type PersistedPurchaseSession = Omit<PurchaseSession, 'items'>;

export function getPurchaseSubtotal(items: PurchaseItem[]) {
  return items.reduce((subtotal, item) => subtotal + item.totalPriceCents, 0);
}

export function isShoppingListPurchaseItem(item: PurchaseItem) {
  return item.origin === 'shopping-list' || (!item.origin && Boolean(item.sourceShoppingItemId));
}
