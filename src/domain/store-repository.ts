import type { Store, StoreUpdate } from './store';

export interface StoreRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<Store[]>;
  create(store: Store): Promise<Store>;
  update(houseId: string, id: string, changes: StoreUpdate): Promise<Store>;
  setActive(houseId: string, id: string, active: boolean): Promise<Store>;
  remove(houseId: string, id: string): Promise<void>;
}
