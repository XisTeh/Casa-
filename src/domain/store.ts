export type Store = {
  id: string;
  houseId: string;
  name: string;
  nickname: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewStore = Pick<Store, 'name' | 'nickname' | 'address' | 'notes'>;
export type StoreUpdate = Partial<NewStore>;

export type StoreWithStats = Store & {
  purchaseCount: number;
  lastPurchaseAt: string | null;
  totalSpentCents: number;
};
