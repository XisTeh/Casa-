import type { RealtimeChannel } from '@supabase/supabase-js';
import type { HouseBudget } from '../../domain/budget';
import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type BudgetRow = Database['public']['Tables']['house_budgets']['Row'];

export interface RemoteBudgetStore {
  getCurrentUserId(): Promise<string | undefined>;
  list(houseId: string): Promise<HouseBudget[]>;
  apply(budget: HouseBudget): Promise<HouseBudget>;
  subscribe(houseId: string, receive: (budget: HouseBudget) => void): () => void;
}

function mapBudget(row: BudgetRow): HouseBudget {
  return {
    id: row.id,
    syncId: row.id,
    houseId: row.house_id,
    year: row.year,
    month: row.month,
    amountCents: row.amount_cents,
    createdById: row.created_by,
    updatedById: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const channelId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export class SupabaseBudgetRepository implements RemoteBudgetStore {
  private get client() {
    return getSupabaseClient();
  }

  async getCurrentUserId() {
    const { data } = await this.client.auth.getSession();
    return data.session?.user.id;
  }

  async list(houseId: string) {
    const { data, error } = await this.client
      .from('house_budgets')
      .select('*')
      .eq('house_id', houseId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapBudget);
  }

  async apply(budget: HouseBudget) {
    const { data, error } = await this.client.rpc('apply_house_budget', {
      item_id: budget.syncId ?? budget.id,
      target_house_id: budget.houseId,
      item_year: budget.year,
      item_month: budget.month,
      item_amount_cents: budget.amountCents,
      item_created_at: budget.createdAt,
      item_updated_at: budget.updatedAt,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error('O servidor não confirmou o orçamento.');
    return mapBudget(data[0]);
  }

  subscribe(houseId: string, receive: (budget: HouseBudget) => void) {
    const channel: RealtimeChannel = this.client
      .channel(`budgets:${houseId}:${channelId()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'house_budgets',
          filter: `house_id=eq.${houseId}`,
        },
        (payload) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (row?.house_id === houseId) receive(mapBudget(row as BudgetRow));
        },
      )
      .subscribe();
    return () => void this.client.removeChannel(channel);
  }
}
