import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Category, Product } from '../../domain/catalog';
import type { CatalogEntityType } from '../../domain/catalog-sync';
import { SHOPPING_CATEGORIES, SHOPPING_UNITS } from '../../domain/shopping-list';
import type { Store } from '../../domain/store';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type CatalogSyncEntity = Category | Product | Store;
export type RemoteCatalogSnapshot = {
  categories: Category[];
  products: Product[];
  stores: Store[];
};

export interface RemoteCatalogStore {
  getCurrentUserId(): Promise<string | undefined>;
  list(houseId: string): Promise<RemoteCatalogSnapshot>;
  apply(type: CatalogEntityType, entity: CatalogSyncEntity): Promise<CatalogSyncEntity>;
  subscribe(
    houseId: string,
    receive: (type: CatalogEntityType, entity: CatalogSyncEntity) => void,
  ): () => void;
}

type CategoryRow = Database['public']['Tables']['categories']['Row'];
type ProductRow = Database['public']['Tables']['products']['Row'];
type StoreRow = Database['public']['Tables']['stores']['Row'];

const isCategoryKey = (value: string | null): value is NonNullable<Category['legacyKey']> =>
  Boolean(value && SHOPPING_CATEGORIES.includes(value as never));
const isUnit = (value: string): value is Product['defaultUnit'] =>
  SHOPPING_UNITS.includes(value as never);

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    name: row.name,
    normalizedName: row.normalized_name,
    legacyKey: isCategoryKey(row.key) ? row.key : undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function mapProduct(row: ProductRow): Product {
  if (!isUnit(row.default_unit)) throw new Error('O servidor retornou uma unidade inválida.');
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    categoryId: row.category_id,
    name: row.name,
    normalizedName: row.normalized_name,
    brand: row.brand,
    defaultQuantity: row.default_quantity ?? undefined,
    defaultUnit: row.default_unit,
    notes: row.notes,
    favorite: row.favorite,
    isRecurring: row.is_recurring,
    recurrenceDays: row.recurrence_days ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function mapStore(row: StoreRow): Store {
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    name: row.name,
    normalizedName: row.normalized_name,
    nickname: row.nickname,
    address: row.address,
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

const channelId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export class SupabaseCatalogRepository implements RemoteCatalogStore {
  private get client() {
    return getSupabaseClient();
  }

  async getCurrentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id;
  }

  async list(houseId: string): Promise<RemoteCatalogSnapshot> {
    const [categories, products, stores] = await Promise.all([
      this.client.from('categories').select('*').eq('house_id', houseId).order('updated_at'),
      this.client.from('products').select('*').eq('house_id', houseId).order('updated_at'),
      this.client.from('stores').select('*').eq('house_id', houseId).order('updated_at'),
    ]);
    if (categories.error) throw categories.error;
    if (products.error) throw products.error;
    if (stores.error) throw stores.error;
    return {
      categories: (categories.data ?? []).map(mapCategory),
      products: (products.data ?? []).map(mapProduct),
      stores: (stores.data ?? []).map(mapStore),
    };
  }

  async apply(type: CatalogEntityType, entity: CatalogSyncEntity) {
    if (type === 'category') {
      const item = entity as Category;
      const { data, error } = await this.client.rpc('apply_category', {
        item_id: item.syncId ?? item.id,
        target_house_id: item.houseId,
        item_key: item.legacyKey ?? '',
        item_name: item.name,
        item_normalized_name: item.normalizedName,
        item_active: item.active,
        item_created_at: item.createdAt,
        item_updated_at: item.updatedAt,
        item_deleted_at: item.deletedAt ?? null,
      });
      if (error) throw error;
      if (!data?.[0]) throw new Error('O servidor não confirmou a categoria.');
      return mapCategory(data[0]);
    }
    if (type === 'product') {
      const item = entity as Product;
      const { data, error } = await this.client.rpc('apply_product', {
        item_id: item.syncId ?? item.id,
        target_house_id: item.houseId,
        target_category_id: item.categoryId,
        item_name: item.name,
        item_normalized_name: item.normalizedName,
        item_brand: item.brand,
        item_default_quantity: item.defaultQuantity ?? null,
        item_default_unit: item.defaultUnit,
        item_notes: item.notes,
        item_favorite: item.favorite,
        item_is_recurring: item.isRecurring ?? false,
        item_recurrence_days: item.isRecurring ? (item.recurrenceDays ?? null) : null,
        item_active: item.active,
        item_created_at: item.createdAt,
        item_updated_at: item.updatedAt,
        item_deleted_at: item.deletedAt ?? null,
      });
      if (error) throw error;
      if (!data?.[0]) throw new Error('O servidor não confirmou o produto.');
      return mapProduct(data[0]);
    }
    const item = entity as Store;
    const { data, error } = await this.client.rpc('apply_store', {
      item_id: item.syncId ?? item.id,
      target_house_id: item.houseId,
      item_name: item.name,
      item_normalized_name: item.normalizedName ?? item.name.toLocaleLowerCase('pt-BR'),
      item_nickname: item.nickname,
      item_address: item.address,
      item_notes: item.notes,
      item_active: item.active,
      item_created_at: item.createdAt,
      item_updated_at: item.updatedAt,
      item_deleted_at: item.deletedAt ?? null,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error('O servidor não confirmou o mercado.');
    return mapStore(data[0]);
  }

  subscribe(
    houseId: string,
    receive: (type: CatalogEntityType, entity: CatalogSyncEntity) => void,
  ) {
    const channel: RealtimeChannel = this.client.channel(`catalog:${houseId}:${channelId()}`);
    const definitions = [
      ['categories', 'category', mapCategory],
      ['products', 'product', mapProduct],
      ['stores', 'store', mapStore],
    ] as const;
    for (const [table, type, mapper] of definitions) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `house_id=eq.${houseId}` },
        (payload) => {
          const candidate = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (!candidate || candidate.house_id !== houseId) return;
          try {
            receive(type, mapper(candidate as never));
          } catch {
            /* próxima reconciliação corrige */
          }
        },
      );
    }
    channel.subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
