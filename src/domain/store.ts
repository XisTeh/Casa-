export type Store = {
  id: string;
  /** UUID usado no Supabase; o ID local continua estável para compras antigas. */
  syncId?: string;
  houseId: string;
  name: string;
  normalizedName?: string;
  nickname: string;
  address: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type NewStore = Pick<Store, 'name' | 'nickname' | 'address' | 'notes'>;
export type StoreUpdate = Partial<NewStore>;

export type StoreWithStats = Store & {
  purchaseCount: number;
  lastPurchaseAt: string | null;
  totalSpentCents: number;
};
