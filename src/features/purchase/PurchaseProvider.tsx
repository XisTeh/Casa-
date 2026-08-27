import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PurchaseService } from '../../application/purchase-service';
import { defaultPurchaseService } from '../../app/app-services';
import type {
  ManualPurchaseItemInput,
  PurchaseEntryMode,
  PurchaseSession,
} from '../../domain/purchase';
import type { ShoppingListItem, ShoppingSyncStatus } from '../../domain/shopping-list';
import type { Store } from '../../domain/store';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useStores } from '../stores/StoreContext';
import { useProducts } from '../products/ProductContext';
import { purchaseContext } from './PurchaseContext';
import { useHousehold } from '../house/HouseContext';
import type { LegacyPurchaseMigration } from '../../domain/purchase-sync';

type PurchaseProviderProps = { children: ReactNode; service?: PurchaseService };

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
  const [activeSessions, setActiveSessions] = useState<PurchaseSession[]>([]);
  const [activeSession, setActiveSession] = useState<PurchaseSession | null>(null);
  const selectedSessionId = useRef<string | null>(null);
  const [completedSessions, setCompletedSessions] = useState<PurchaseSession[]>([]);
  const [syncStatus, setSyncStatus] = useState<ShoppingSyncStatus>({ state: 'local', pending: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacyCandidate, setLegacyCandidate] = useState<{
    houseId: string;
    migration: LegacyPurchaseMigration;
  } | null>(null);

  const refreshPurchases = useCallback(async () => {
    const [sessions, completed] = await Promise.all([
      service.listActiveSessions(activeHouse.id),
      service.listCompletedSessions(activeHouse.id),
    ]);
    setActiveSessions(sessions);
    setCompletedSessions(completed);
    const selectedId = selectedSessionId.current;
    if (selectedId) {
      const selected = await service.getSession(selectedId, activeHouse.id);
      if (selectedSessionId.current === selectedId) setActiveSession(selected);
    } else {
      const mine = sessions.find((session) => session.purchasedById === activeMember.id);
      if (mine && selectedSessionId.current === null) {
        selectedSessionId.current = mine.id;
        setActiveSession(mine);
      } else if (selectedSessionId.current === null) setActiveSession(null);
    }
    setError(null);
  }, [activeHouse.id, activeMember.id, service]);

  useEffect(() => {
    let current = true;
    const unsubscribe = service.subscribe(
      activeHouse.id,
      () => void refreshPurchases(),
      (status) => current && setSyncStatus(status),
    );
    void service
      .syncNow(activeHouse.id)
      .then(refreshPurchases)
      .then(() => service.getLegacyMigration(activeHouse.id))
      .then(
        (migration) =>
          current && setLegacyCandidate(migration ? { houseId: activeHouse.id, migration } : null),
      )
      .catch(() => current && setError('Não foi possível abrir as compras locais.'))
      .finally(() => current && setIsLoading(false));
    return () => {
      current = false;
      unsubscribe();
    };
  }, [activeHouse.id, refreshPurchases, service]);

  const select = useCallback((session: PurchaseSession | null) => {
    selectedSessionId.current = session?.id ?? null;
    setActiveSession(session);
  }, []);

  const startPurchase = useCallback(
    async (
      store: Pick<Store, 'id' | 'name'>,
      entryMode: PurchaseEntryMode = 'list',
      startAnother = false,
    ) => {
      const session = await service.startPurchase(store, entryMode, actor, startAnother);
      select(session);
      await refreshPurchases();
      return session;
    },
    [actor, refreshPurchases, select, service],
  );

  const watchPurchase = useCallback(
    async (sessionId: string) => {
      const session = await service.getSession(sessionId, activeHouse.id);
      if (!session) throw new Error('Esta compra não está mais disponível.');
      select(session);
    },
    [activeHouse.id, select, service],
  );

  const withSelected = useCallback(
    async (operation: (sessionId: string) => Promise<PurchaseSession>) => {
      if (!activeSession) throw new Error('Selecione uma compra.');
      const session = await operation(activeSession.id);
      select(session);
      await refreshPurchases();
      return session;
    },
    [activeSession, refreshPurchases, select],
  );

  const markPurchased = useCallback(
    (item: ShoppingListItem, quantity: number, price: number) =>
      withSelected((sessionId) =>
        service.markPurchased(item, quantity, price, activeHouse.id, sessionId),
      ),
    [activeHouse.id, service, withSelected],
  );
  const undoPurchasedItem = useCallback(
    (sourceId: string) =>
      withSelected((sessionId) => service.undoPurchasedItem(sourceId, activeHouse.id, sessionId)),
    [activeHouse.id, service, withSelected],
  );
  const addManualItem = useCallback(
    (input: ManualPurchaseItemInput) =>
      withSelected((sessionId) => service.addManualItem(input, activeHouse.id, sessionId)),
    [activeHouse.id, service, withSelected],
  );
  const updateManualItem = useCallback(
    (itemId: string, input: ManualPurchaseItemInput) =>
      withSelected((sessionId) =>
        service.updateManualItem(itemId, input, activeHouse.id, sessionId),
      ),
    [activeHouse.id, service, withSelected],
  );
  const removePurchaseItem = useCallback(
    (itemId: string) =>
      withSelected((sessionId) => service.removePurchaseItem(itemId, activeHouse.id, sessionId)),
    [activeHouse.id, service, withSelected],
  );
  const cancelPurchase = useCallback(async () => {
    if (!activeSession) throw new Error('Selecione uma compra.');
    const cancelled = await service.cancelPurchase(activeHouse.id, activeSession.id);
    select(null);
    setActiveSessions(await service.listActiveSessions(activeHouse.id));
    return cancelled;
  }, [activeHouse.id, activeSession, select, service]);
  const completePurchase = useCallback(async () => {
    if (!activeSession) throw new Error('Selecione uma compra.');
    const completed = await service.completePurchase(activeHouse.id, activeSession.id);
    await Promise.all([refreshItems(), refreshStores(), refreshProducts()]);
    select(null);
    const [sessions, completedSessions] = await Promise.all([
      service.listActiveSessions(activeHouse.id),
      service.listCompletedSessions(activeHouse.id),
    ]);
    setActiveSessions(sessions);
    setCompletedSessions(completedSessions);
    return completed;
  }, [
    activeHouse.id,
    activeSession,
    refreshItems,
    refreshProducts,
    refreshStores,
    select,
    service,
  ]);
  const legacyMigration =
    legacyCandidate?.houseId === activeHouse.id ? legacyCandidate.migration : null;
  const importLegacyPurchases = useCallback(async () => {
    if (!legacyMigration) return;
    await legacyMigration.importIntoHouse();
    await refreshPurchases();
    setLegacyCandidate(null);
  }, [legacyMigration, refreshPurchases]);

  const value = useMemo(
    () => ({
      activeSession,
      activeSessions,
      completedSessions,
      latestCompletedSession: completedSessions[0] ?? null,
      isOwner: Boolean(activeSession && activeSession.purchasedById === activeMember.id),
      isLoading,
      error,
      syncStatus,
      startPurchase,
      watchPurchase,
      leavePurchase: () => select(null),
      markPurchased,
      undoPurchasedItem,
      addManualItem,
      updateManualItem,
      removePurchaseItem,
      cancelPurchase,
      completePurchase,
      legacyMigration,
      importLegacyPurchases,
    }),
    [
      activeMember.id,
      activeSession,
      activeSessions,
      addManualItem,
      cancelPurchase,
      completePurchase,
      completedSessions,
      error,
      importLegacyPurchases,
      isLoading,
      markPurchased,
      legacyMigration,
      removePurchaseItem,
      select,
      startPurchase,
      syncStatus,
      undoPurchasedItem,
      updateManualItem,
      watchPurchase,
    ],
  );

  return <purchaseContext.Provider value={value}>{children}</purchaseContext.Provider>;
}
