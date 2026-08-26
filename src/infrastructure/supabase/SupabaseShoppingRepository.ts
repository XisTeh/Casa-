import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ShoppingListItem } from '../../domain/shopping-list';
import {
  SHOPPING_CATEGORIES,
  SHOPPING_ITEM_STATUSES,
  SHOPPING_PRIORITIES,
  SHOPPING_UNITS,
} from '../../domain/shopping-list';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type ShoppingRow = Database['public']['Tables']['shopping_items']['Row'];

export interface RemoteShoppingStore {
  getCurrentUserId(): Promise<string | undefined>;
  list(houseId: string): Promise<ShoppingListItem[]>;
  apply(item: ShoppingListItem): Promise<ShoppingListItem>;
  subscribe(houseId: string, receive: (item: ShoppingListItem) => void): () => void;
}

function includesValue<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return values.includes(value as T[number]);
}

function mapRow(row: ShoppingRow): ShoppingListItem {
  if (
    !includesValue(SHOPPING_UNITS, row.unit) ||
    !includesValue(SHOPPING_CATEGORIES, row.category_key) ||
    !includesValue(SHOPPING_PRIORITIES, row.priority) ||
    !includesValue(SHOPPING_ITEM_STATUSES, row.status)
  ) {
    throw new Error('O servidor retornou um item da Lista com valores inválidos.');
  }
  return {
    id: row.id,
    houseId: row.house_id,
    productId: row.product_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    productName: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    category: row.category_key,
    categoryName: row.category_name ?? undefined,
    preferredBrand: row.preferred_brand,
    notes: row.notes,
    priority: row.priority,
    status: row.status,
    addedBy: row.added_by_name,
    addedByMemberId: row.created_by,
    addedByNameSnapshot: row.added_by_name,
    updatedByMemberId: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function channelId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class SupabaseShoppingRepository implements RemoteShoppingStore {
  private get client() {
    return getSupabaseClient();
  }

  async getCurrentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id;
  }

  async list(houseId: string) {
    const { data, error } = await this.client
      .from('shopping_items')
      .select('*')
      .eq('house_id', houseId)
      .order('updated_at');
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async apply(item: ShoppingListItem) {
    const { data, error } = await this.client.rpc('apply_shopping_item', {
      item_id: item.id,
      target_house_id: item.houseId,
      target_product_id: isUuid(item.productId) ? item.productId! : null,
      target_category_id: isUuid(item.categoryId) ? item.categoryId! : null,
      item_name: item.productName,
      item_normalized_name: normalizeName(item.productName),
      item_quantity: item.quantity,
      item_unit: item.unit,
      item_category_key: item.category,
      item_category_name: item.categoryName ?? '',
      item_preferred_brand: item.preferredBrand,
      item_notes: item.notes,
      item_priority: item.priority,
      item_status: item.status,
      item_added_by_name: item.addedByNameSnapshot ?? item.addedBy,
      item_created_at: item.createdAt,
      item_updated_at: item.updatedAt,
      item_deleted_at: item.deletedAt ?? null,
    });
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error('O servidor não confirmou a alteração da Lista.');
    return mapRow(row);
  }

  subscribe(houseId: string, receive: (item: ShoppingListItem) => void) {
    const channel: RealtimeChannel = this.client
      .channel(`shopping-items:${houseId}:${channelId()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `house_id=eq.${houseId}` },
        (payload) => {
          const candidate = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (!candidate || candidate.house_id !== houseId) return;
          try {
            receive(
              mapRow(
                payload.eventType === 'DELETE'
                  ? ({ ...candidate, deleted_at: candidate.updated_at } as ShoppingRow)
                  : (candidate as ShoppingRow),
              ),
            );
          } catch {
            // Um evento inválido não pode interromper a fila local; a próxima reconciliação corrige.
          }
        },
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
