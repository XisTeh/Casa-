import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PurchaseService } from '../../application/purchase-service';
import { defaultPurchaseService } from '../../app/app-services';
import type {
  ManualPurchaseItemInput,
  PurchaseEntryMode,
  PurchaseSession,
} from '../../domain/purchase';
import type { ShoppingListItem } from '../../domain/shopping-list';
import type { Store } from '../../domain/store';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useStores } from '../stores/StoreContext';
import { useProducts } from '../products/ProductContext';
import { purchaseContext } from './PurchaseContext';
import { useHousehold } from '../house/HouseContext';

type PurchaseProviderProps = {
  children: ReactNode;
  service?: PurchaseService;
};

export function PurchaseProvider({
  children,
  service = defaultPurchaseService,
}: PurchaseProviderProps) {
  const { activeHouse, activeMember } = useHousehold();
  const actor = useMemo(
    () => ({
      houseId: activeHouse.id,
      memberId: activeMember.id,
      memberName: activeMember.displayName,
    }),
    [activeHouse.id, activeMember.displayName, activeMember.id],
  );
  const { refreshItems } = useShoppingList();
  const { refreshStores } = useStores();
  const { refreshProducts } = useProducts();
  const [activeSession, setActiveSession] = useState<PurchaseSession | null>(null);
  const [completedSessions, setCompletedSessions] = useState<PurchaseSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadPurchases() {
      try {
        const [savedActiveSession, savedCompletedSessions] = await Promise.all([
          service.getActiveSession(activeHouse.id),
          service.listCompletedSessions(activeHouse.id),
        ]);

        if (isCurrent) {
          setActiveSession(savedActiveSession);
          setCompletedSessions(savedCompletedSessions);
          setError(null);
        }
      } catch {
        if (isCurrent) {
          setError('Não foi possível abrir as compras locais.');
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadPurchases();

    return () => {
      isCurrent = false;
    };
  }, [activeHouse.id, service]);

  const startPurchase = useCallback(
    async (store: Pick<Store, 'id' | 'name'>, entryMode: PurchaseEntryMode = 'list') => {
      const session = await service.startPurchase(store, entryMode, actor);
      setActiveSession(session);
      setError(null);
      return session;
    },
    [actor, service],
  );

  const markPurchased = useCallback(
    async (item: ShoppingListItem, purchasedQuantity: number, unitPriceCents: number) => {
      const session = await service.markPurchased(
        item,
        purchasedQuantity,
        unitPriceCents,
        activeHouse.id,
      );
      setActiveSession(session);
      setError(null);
      return session;
    },
    [activeHouse.id, service],
  );

  const undoPurchasedItem = useCallback(
    async (sourceShoppingItemId: string) => {
      const session = await service.undoPurchasedItem(sourceShoppingItemId, activeHouse.id);
      setActiveSession(session);
      setError(null);
      return session;
    },
    [activeHouse.id, service],
  );

  const addManualItem = useCallback(
    async (input: ManualPurchaseItemInput) => {
      const session = await service.addManualItem(input, activeHouse.id);
      setActiveSession(session);
      setError(null);
      return session;
    },
    [activeHouse.id, service],
  );

  const updateManualItem = useCallback(
    async (itemId: string, input: ManualPurchaseItemInput) => {
      const session = await service.updateManualItem(itemId, input, activeHouse.id);
      setActiveSession(session);
      setError(null);
      return session;
    },
    [activeHouse.id, service],
  );

  const removePurchaseItem = useCallback(
    async (itemId: string) => {
      const session = await service.removePurchaseItem(itemId, activeHouse.id);
      setActiveSession(session);
      setError(null);
      return session;
    },
    [activeHouse.id, service],
  );

  const cancelPurchase = useCallback(async () => {
    await service.cancelPurchase(activeHouse.id);
    setActiveSession(null);
    setError(null);
  }, [activeHouse.id, service]);

  const completePurchase = useCallback(async () => {
    const completedSession = await service.completePurchase(activeHouse.id);
    await Promise.all([refreshItems(), refreshStores(), refreshProducts()]);
    setActiveSession(null);
    setCompletedSessions((currentSessions) => [completedSession, ...currentSessions]);
    setError(null);
    return completedSession;
  }, [activeHouse.id, refreshItems, refreshProducts, refreshStores, service]);

  const value = useMemo(() => {
    return {
      activeSession,
      completedSessions,
      latestCompletedSession: completedSessions[0] ?? null,
      isLoading,
      error,
      startPurchase,
      markPurchased,
      undoPurchasedItem,
      addManualItem,
      updateManualItem,
      removePurchaseItem,
      cancelPurchase,
      completePurchase,
    };
  }, [
    activeSession,
    addManualItem,
    cancelPurchase,
    completePurchase,
    completedSessions,
    error,
    isLoading,
    markPurchased,
    removePurchaseItem,
    startPurchase,
    undoPurchasedItem,
    updateManualItem,
  ]);

  return <purchaseContext.Provider value={value}>{children}</purchaseContext.Provider>;
}
