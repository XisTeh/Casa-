import { createContext, useContext } from 'react';
import type {
  NewShoppingListItem,
  ShoppingListItem,
  ShoppingListItemUpdate,
  ShoppingSyncStatus,
  LegacyShoppingMigration,
} from '../../domain/shopping-list';

export type ShoppingListContextValue = {
  items: ShoppingListItem[];
  isLoading: boolean;
  error: string | null;
  syncStatus: ShoppingSyncStatus;
  createItem: (input: NewShoppingListItem) => Promise<ShoppingListItem>;
  updateItem: (id: string, changes: ShoppingListItemUpdate) => Promise<ShoppingListItem>;
  removeItem: (id: string) => Promise<void>;
  refreshItems: () => Promise<void>;
  legacyMigration: LegacyShoppingMigration | null;
  importLegacyItems: () => Promise<void>;
};

export const shoppingListContext = createContext<ShoppingListContextValue | null>(null);

export function useShoppingList() {
  const context = useContext(shoppingListContext);

  if (!context) {
    throw new Error('useShoppingList deve ser usado dentro de ShoppingListProvider.');
  }

  return context;
}
