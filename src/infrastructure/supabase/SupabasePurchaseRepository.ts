import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  PersistedPurchaseSession,
  PurchaseItem,
  PurchaseItemOrigin,
  PurchaseSessionStatus,
} from '../../domain/purchase';
import {
  PURCHASE_ENTRY_MODES,
  PURCHASE_ITEM_ORIGINS,
  PURCHASE_SESSION_STATUSES,
} from '../../domain/purchase';
import {
  SHOPPING_CATEGORIES,
  SHOPPING_PRIORITIES,
  SHOPPING_UNITS,
} from '../../domain/shopping-list';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

export type RemotePurchaseEntity = PersistedPurchaseSession | PurchaseItem;
export type RemotePurchaseSnapshot = {
  sessions: PersistedPurchaseSession[];
  items: PurchaseItem[];
};

export interface RemotePurchaseStore {
  getCurrentUserId(): Promise<string | undefined>;
  list(houseId: string): Promise<RemotePurchaseSnapshot>;
  applySession(session: PersistedPurchaseSession): Promise<PersistedPurchaseSession>;
  applyItem(item: PurchaseItem, remoteSessionId: string): Promise<PurchaseItem>;
  subscribe(
    houseId: string,
    receive: (type: 'purchase-session' | 'purchase-item', entity: RemotePurchaseEntity) => void,
  ): () => void;
}

type SessionRow = Database['public']['Tables']['purchase_sessions']['Row'];
type ItemRow = Database['public']['Tables']['purchase_items']['Row'];

const isUuid = (value?: string | null) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
const nullableUuid = (value?: string | null) => (isUuid(value) ? value! : null);

function mapSession(row: SessionRow): PersistedPurchaseSession {
  const status = PURCHASE_SESSION_STATUSES.includes(row.status as PurchaseSessionStatus)
    ? (row.status as PurchaseSessionStatus)
    : 'active';
  const entryMode = PURCHASE_ENTRY_MODES.includes(row.entry_mode as 'list' | 'quick')
    ? (row.entry_mode as 'list' | 'quick')
    : 'list';
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    storeId: row.store_id ?? undefined,
    storeNameSnapshot: row.store_name_snapshot,
    entryMode,
    status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    purchasedById: row.started_by,
    purchasedByNameSnapshot: row.started_by_name,
    totalPriceCents: 0,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function mapItem(row: ItemRow): PurchaseItem {
  const origin = PURCHASE_ITEM_ORIGINS.includes(row.origin as PurchaseItemOrigin)
    ? (row.origin as PurchaseItemOrigin)
    : 'manual';
  if (!SHOPPING_CATEGORIES.includes(row.category_key_snapshot as never))
    throw new Error('Categoria remota inválida.');
  if (!SHOPPING_PRIORITIES.includes(row.priority_snapshot as never))
    throw new Error('Prioridade remota inválida.');
  if (!SHOPPING_UNITS.includes(row.unit_snapshot as never))
    throw new Error('Unidade remota inválida.');
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    purchaseSessionId: row.purchase_session_id,
    origin,
    sourceShoppingItemId: row.source_shopping_item_id ?? undefined,
    productId: row.product_id ?? undefined,
    productNameSnapshot: row.product_name_snapshot,
    brandSnapshot: row.brand_snapshot,
    categorySnapshot: row.category_key_snapshot as PurchaseItem['categorySnapshot'],
    categoryNameSnapshot: row.category_name_snapshot ?? undefined,
    prioritySnapshot: row.priority_snapshot as PurchaseItem['prioritySnapshot'],
    notesSnapshot: row.notes_snapshot,
    plannedQuantity: row.planned_quantity,
    purchasedQuantity: row.purchased_quantity,
    unitSnapshot: row.unit_snapshot as PurchaseItem['unitSnapshot'],
    unitPriceCents: row.unit_price_cents,
    totalPriceCents: row.total_price_cents,
    storeId: row.store_id ?? undefined,
    storeNameSnapshot: row.store_name_snapshot,
    purchasedById: row.created_by,
    purchasedByNameSnapshot: row.created_by_name_snapshot,
    purchasedAt: row.purchased_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

const channelId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export class SupabasePurchaseRepository implements RemotePurchaseStore {
  private get client() {
    return getSupabaseClient();
  }

  async getCurrentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id;
  }

  async list(houseId: string): Promise<RemotePurchaseSnapshot> {
    const [sessions, items] = await Promise.all([
      this.client.from('purchase_sessions').select('*').eq('house_id', houseId).order('updated_at'),
      this.client.from('purchase_items').select('*').eq('house_id', houseId).order('updated_at'),
    ]);
    if (sessions.error) throw sessions.error;
    if (items.error) throw items.error;
    return {
      sessions: (sessions.data ?? []).map(mapSession),
      items: (items.data ?? []).map(mapItem),
    };
  }

  async applySession(session: PersistedPurchaseSession) {
    const { data, error } = await this.client.rpc('apply_purchase_session', {
      item_id: session.syncId ?? session.id,
      target_house_id: session.houseId,
      item_started_by_name: session.purchasedByNameSnapshot,
      item_store_id: nullableUuid(session.storeId),
      item_store_name: session.storeNameSnapshot,
      item_entry_mode: session.entryMode ?? 'list',
      item_status: session.status,
      item_started_at: session.startedAt,
      item_completed_at: session.completedAt ?? null,
      item_cancelled_at: session.cancelledAt ?? null,
      item_created_at: session.startedAt,
      item_updated_at: session.updatedAt ?? session.startedAt,
      item_deleted_at: session.deletedAt ?? null,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error('O servidor não confirmou a compra.');
    return mapSession(data[0]);
  }

  async applyItem(item: PurchaseItem, remoteSessionId: string) {
    const { data, error } = await this.client.rpc('apply_purchase_item', {
      item_id: item.syncId ?? item.id,
      target_session_id: remoteSessionId,
      target_house_id: item.houseId,
      item_origin: item.origin ?? (item.sourceShoppingItemId ? 'shopping-list' : 'manual'),
      item_source_shopping_id: nullableUuid(item.sourceShoppingItemId),
      item_product_id: nullableUuid(item.productId),
      item_product_name: item.productNameSnapshot,
      item_brand: item.brandSnapshot,
      item_category_key: item.categorySnapshot,
      item_category_name: item.categoryNameSnapshot ?? '',
      item_priority: item.prioritySnapshot,
      item_notes: item.notesSnapshot,
      item_planned_quantity: item.plannedQuantity,
      item_purchased_quantity: item.purchasedQuantity,
      item_unit: item.unitSnapshot,
      item_unit_price_cents: item.unitPriceCents,
      item_total_price_cents: item.totalPriceCents,
      item_store_id: nullableUuid(item.storeId),
      item_store_name: item.storeNameSnapshot,
      item_created_by_name: item.purchasedByNameSnapshot,
      item_purchased_at: item.purchasedAt,
      item_created_at: item.createdAt ?? item.purchasedAt,
      item_updated_at: item.updatedAt ?? item.purchasedAt,
      item_deleted_at: item.deletedAt ?? null,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error('O servidor não confirmou o item da compra.');
    return mapItem(data[0]);
  }

  subscribe(
    houseId: string,
    receive: (type: 'purchase-session' | 'purchase-item', entity: RemotePurchaseEntity) => void,
  ) {
    const channel: RealtimeChannel = this.client.channel(`purchases:${houseId}:${channelId()}`);
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'purchase_sessions',
        filter: `house_id=eq.${houseId}`,
      },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (row?.house_id === houseId) receive('purchase-session', mapSession(row as SessionRow));
      },
    );
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'purchase_items', filter: `house_id=eq.${houseId}` },
      (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (row?.house_id !== houseId) return;
        try {
          receive('purchase-item', mapItem(row as ItemRow));
        } catch {
          /* a reconciliação seguinte corrige payload parcial */
        }
      },
    );
    channel.subscribe();
    return () => void this.client.removeChannel(channel);
  }
}
