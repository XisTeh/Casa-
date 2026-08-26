export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export type AppRuntimeMode = 'remote' | 'local' | 'configuration-error';

export function resolveAppRuntimeMode({
  allowLocalFallback,
  production,
  remoteMode,
  supabaseConfigured,
}: {
  allowLocalFallback: boolean;
  production: boolean;
  remoteMode?: boolean;
  supabaseConfigured: boolean;
}): AppRuntimeMode {
  if (remoteMode === true || (remoteMode === undefined && supabaseConfigured)) return 'remote';
  if (allowLocalFallback) return 'local';
  return production ? 'configuration-error' : 'local';
}

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigurationError';
  }
}

function looksLikePlaceholder(value: string) {
  return value.includes('seu-projeto') || value.includes('sua-chave');
}

function isPublicSupabaseKey(value: string) {
  return value.startsWith('sb_publishable_') || value.startsWith('eyJ');
}

export function getSupabaseConfig(): SupabasePublicConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!url || !anonKey || looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)) {
    throw new SupabaseConfigurationError(
      'Supabase não configurado. Copie .env.example para .env e informe VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    );
  }

  if (!isPublicSupabaseKey(anonKey) || anonKey.startsWith('sb_secret_')) {
    throw new SupabaseConfigurationError(
      'VITE_SUPABASE_ANON_KEY deve usar uma chave pública do Supabase.',
    );
  }

  try {
    const parsedUrl = new URL(url);
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== 'https:' && !(localHost && parsedUrl.protocol === 'http:')) {
      throw new Error('Protocolo inválido');
    }
  } catch {
    throw new SupabaseConfigurationError(
      'VITE_SUPABASE_URL deve ser uma URL HTTPS válida ou um endereço local HTTP.',
    );
  }

  return { url, anonKey };
}

export function isSupabaseConfigured() {
  try {
    getSupabaseConfig();
    return true;
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) return false;
    throw error;
  }
}
