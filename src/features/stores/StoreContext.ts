import { createContext, useContext } from 'react';
import type { NewStore, Store, StoreUpdate, StoreWithStats } from '../../domain/store';

export type StoreContextValue = {
  stores: StoreWithStats[];
  activeStores: StoreWithStats[];
  isLoading: boolean;
  error: string | null;
  createStore: (input: NewStore) => Promise<Store>;
  updateStore: (id: string, changes: StoreUpdate) => Promise<Store>;
  setStoreActive: (id: string, active: boolean) => Promise<Store>;
  removeStore: (id: string) => Promise<void>;
  refreshStores: () => Promise<void>;
};

export const storeContext = createContext<StoreContextValue | null>(null);

export function useStores() {
  const context = useContext(storeContext);
  if (!context) throw new Error('useStores deve ser usado dentro de StoreProvider.');
  return context;
}
