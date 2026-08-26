export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigurationError';
  }
}

function looksLikePlaceholder(value: string) {
  return value.includes('seu-projeto') || value.includes('sua-chave');
}

export function getSupabaseConfig(): SupabasePublicConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (!url || !anonKey || looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)) {
    throw new SupabaseConfigurationError(
      'Supabase não configurado. Copie .env.example para .env e informe VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
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
