import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../env';
import type { Database } from './database.types';

let client: SupabaseClient<Database> | undefined;

/**
 * Cria o cliente somente quando alguma feature realmente usa o Supabase. Assim a
 * fundação visual roda sem credenciais, e features conectadas recebem um erro claro.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, anonKey } = getSupabaseConfig();
  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  return client;
}
