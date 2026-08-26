import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ShoppingListService } from '../../application/shopping-list-service';
import { defaultShoppingListService } from '../../app/app-services';
import {
  type NewShoppingListItem,
  type ShoppingListItem,
  type ShoppingListItemUpdate,
} from '../../domain/shopping-list';
import { shoppingListContext } from './ShoppingListContext';
import { useHousehold } from '../house/HouseContext';

type ShoppingListProviderProps = {
  children: ReactNode;
  service?: ShoppingListService;
};

function sortItems(items: ShoppingListItem[]) {
  return [...items].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

export function ShoppingListProvider({
  children,
  service = defaultShoppingListService,
}: ShoppingListProviderProps) {
  const { activeHouse, activeMember } = useHousehold();
  const actor = useMemo(
    () => ({
      houseId: activeHouse.id,
      memberId: activeMember.id,
      memberName: activeMember.displayName,
    }),
    [activeHouse.id, activeMember.displayName, activeMember.id],
  );
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshItems = useCallback(async () => {
    const savedItems = await service.list(activeHouse.id);
    setItems(sortItems(savedItems));
    setError(null);
  }, [activeHouse.id, service]);

  useEffect(() => {
    let isCurrent = true;

    async function loadItems() {
      try {
        const savedItems = await service.list(activeHouse.id);

        if (isCurrent) {
          setItems(sortItems(savedItems));
          setError(null);
        }
      } catch {
        if (isCurrent) {
          setError('Não foi possível abrir a lista local.');
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      isCurrent = false;
    };
  }, [activeHouse.id, service]);

  const createItem = useCallback(
    async (input: NewShoppingListItem) => {
      const item = await service.create(input, actor);
      setItems((currentItems) => sortItems([...currentItems, item]));
      setError(null);
      return item;
    },
    [actor, service],
  );

  const updateItem = useCallback(
    async (id: string, changes: ShoppingListItemUpdate) => {
      const updatedItem = await service.update(id, changes, activeHouse.id);
      setItems((currentItems) =>
        sortItems(currentItems.map((item) => (item.id === id ? updatedItem : item))),
      );
      setError(null);
      return updatedItem;
    },
    [activeHouse.id, service],
  );

  const removeItem = useCallback(
    async (id: string) => {
      await service.remove(id, activeHouse.id);
      setItems((currentItems) => currentItems.filter((item) => item.id !== id));
      setError(null);
    },
    [activeHouse.id, service],
  );

  const value = useMemo(
    () => ({ items, isLoading, error, createItem, updateItem, removeItem, refreshItems }),
    [createItem, error, isLoading, items, refreshItems, removeItem, updateItem],
  );

  return <shoppingListContext.Provider value={value}>{children}</shoppingListContext.Provider>;
}
