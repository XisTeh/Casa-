import { describe, expect, it, vi } from 'vitest';
import { getSupabaseConfig, isSupabaseConfigured, SupabaseConfigurationError } from '../lib/env';

describe('configuração pública do Supabase', () => {
  it('mantém modo local quando as variáveis não existem', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => getSupabaseConfig()).toThrow(SupabaseConfigurationError);
  });

  it('aceita HTTPS remoto e HTTP somente para desenvolvimento local', () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_chave-publica');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co');
    expect(getSupabaseConfig().url).toBe('https://projeto.supabase.co');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    expect(getSupabaseConfig().url).toBe('http://127.0.0.1:54321');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://site-inseguro.example');
    expect(() => getSupabaseConfig()).toThrow(/HTTPS válida/i);
  });

  it('recusa chaves privadas ou valores que não sejam públicos', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://projeto.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_secret_nao_pode_ir_para_o_frontend');
    expect(() => getSupabaseConfig()).toThrow(/chave pública/i);
  });
});
