import type { ShoppingListItem, ShoppingListItemUpdate } from './shopping-list';

export interface ShoppingListRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<ShoppingListItem[]>;
  create(item: ShoppingListItem): Promise<ShoppingListItem>;
  update(houseId: string, id: string, changes: ShoppingListItemUpdate): Promise<ShoppingListItem>;
  remove(houseId: string, id: string): Promise<void>;
}
