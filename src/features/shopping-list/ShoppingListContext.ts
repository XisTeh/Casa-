import { createContext, useContext } from 'react';
import type {
  NewShoppingListItem,
  ShoppingListItem,
  ShoppingListItemUpdate,
} from '../../domain/shopping-list';

export type ShoppingListContextValue = {
  items: ShoppingListItem[];
  isLoading: boolean;
  error: string | null;
  createItem: (input: NewShoppingListItem) => Promise<ShoppingListItem>;
  updateItem: (id: string, changes: ShoppingListItemUpdate) => Promise<ShoppingListItem>;
  removeItem: (id: string) => Promise<void>;
  refreshItems: () => Promise<void>;
};

export const shoppingListContext = createContext<ShoppingListContextValue | null>(null);

export function useShoppingList() {
  const context = useContext(shoppingListContext);

  if (!context) {
    throw new Error('useShoppingList deve ser usado dentro de ShoppingListProvider.');
  }

  return context;
}
