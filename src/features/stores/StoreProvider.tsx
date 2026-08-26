import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreService } from '../../application/store-service';
import { defaultStoreService } from '../../app/app-services';
import type { NewStore, StoreUpdate, StoreWithStats } from '../../domain/store';
import { storeContext } from './StoreContext';
import { useHousehold } from '../house/HouseContext';

type StoreProviderProps = {
  children: ReactNode;
  service?: StoreService;
};

export function StoreProvider({ children, service = defaultStoreService }: StoreProviderProps) {
  const { activeHouse } = useHousehold();
  const [stores, setStores] = useState<StoreWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStores = useCallback(async () => {
    const savedStores = await service.list(activeHouse.id);
    setStores(savedStores);
    setError(null);
  }, [activeHouse.id, service]);

  useEffect(() => {
    let isCurrent = true;
    service
      .list(activeHouse.id)
      .then((savedStores) => {
        if (isCurrent) {
          setStores(savedStores);
          setError(null);
        }
      })
      .catch(() => {
        if (isCurrent) setError('Não foi possível abrir os mercados locais.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [activeHouse.id, service]);

  useEffect(
    () => service.subscribe(activeHouse.id, () => void refreshStores()),
    [activeHouse.id, refreshStores, service],
  );

  const createStore = useCallback(
    async (input: NewStore) => {
      const store = await service.create(input, activeHouse.id);
      await refreshStores();
      return store;
    },
    [activeHouse.id, refreshStores, service],
  );

  const updateStore = useCallback(
    async (id: string, changes: StoreUpdate) => {
      const store = await service.update(id, changes, activeHouse.id);
      await refreshStores();
      return store;
    },
    [activeHouse.id, refreshStores, service],
  );

  const setStoreActive = useCallback(
    async (id: string, active: boolean) => {
      const store = await service.setActive(id, active, activeHouse.id);
      await refreshStores();
      return store;
    },
    [activeHouse.id, refreshStores, service],
  );

  const removeStore = useCallback(
    async (id: string) => {
      await service.remove(id, activeHouse.id);
      await refreshStores();
    },
    [activeHouse.id, refreshStores, service],
  );

  const value = useMemo(
    () => ({
      stores,
      activeStores: stores.filter((store) => store.active),
      isLoading,
      error,
      createStore,
      updateStore,
      setStoreActive,
      removeStore,
      refreshStores,
    }),
    [
      createStore,
      error,
      isLoading,
      refreshStores,
      removeStore,
      setStoreActive,
      stores,
      updateStore,
    ],
  );

  return <storeContext.Provider value={value}>{children}</storeContext.Provider>;
}
