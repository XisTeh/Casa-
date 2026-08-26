import type { Session } from '@supabase/supabase-js';
import type { AuthRepository } from '../../domain/auth-repository';
import type { AuthSession, AuthStateEvent, AuthUser } from '../../domain/auth';
import { getSupabaseClient } from '../../lib/supabase/client';

function mapUser(user: Session['user']): AuthUser {
  if (!user.email) throw new Error('A conta autenticada não possui e-mail.');
  return { id: user.id, email: user.email };
}

function mapSession(session: Session | null): AuthSession | null {
  return session ? { accessToken: session.access_token, user: mapUser(session.user) } : null;
}

function throwIfError(error: { message: string; code?: string } | null) {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export class SupabaseAuthRepository implements AuthRepository {
  private readonly client = getSupabaseClient();

  async getSession() {
    const { data, error } = await this.client.auth.getSession();
    throwIfError(error);
    return mapSession(data.session);
  }

  subscribe(listener: Parameters<AuthRepository['subscribe']>[0]) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      listener(event as AuthStateEvent, mapSession(session));
    });
    return { unsubscribe: () => data.subscription.unsubscribe() };
  }

  async signUp(name: string, email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${window.location.origin}/entrar`,
      },
    });
    throwIfError(error);
    if (!data.user) throw new Error('Não foi possível criar sua conta.');
    return {
      user: mapUser(data.user),
      session: mapSession(data.session),
      requiresEmailConfirmation: !data.session,
    };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    throwIfError(error);
    if (!data.session) throw new Error('A sessão não foi criada.');
    return mapSession(data.session)!;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    throwIfError(error);
  }

  async requestPasswordReset(email: string, redirectTo: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    throwIfError(error);
  }

  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    throwIfError(error);
  }
}
