import type { ShoppingListItem, ShoppingListItemUpdate, ShoppingSyncStatus } from './shopping-list';

export interface ShoppingListRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<ShoppingListItem[]>;
  create(item: ShoppingListItem): Promise<ShoppingListItem>;
  update(
    houseId: string,
    id: string,
    changes: ShoppingListItemUpdate,
    actorId?: string,
  ): Promise<ShoppingListItem>;
  remove(houseId: string, id: string, actorId?: string): Promise<void>;
}

export interface OnlineShoppingListRepository extends ShoppingListRepository {
  update(
    houseId: string,
    id: string,
    changes: ShoppingListItemUpdate,
    actorId?: string,
  ): Promise<ShoppingListItem>;
  remove(houseId: string, id: string, actorId?: string): Promise<void>;
  subscribe(
    houseId: string,
    onItemsChanged: () => void,
    onStatusChanged: (status: ShoppingSyncStatus) => void,
  ): () => void;
  syncNow(houseId: string): Promise<void>;
  getStatus(houseId: string): Promise<ShoppingSyncStatus>;
}

export function isOnlineShoppingListRepository(
  repository: ShoppingListRepository,
): repository is OnlineShoppingListRepository {
  return 'syncNow' in repository && 'subscribe' in repository;
}
