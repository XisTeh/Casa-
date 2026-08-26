import type { AuthSession, AuthStateEvent, SignUpResult } from './auth';

export type AuthSubscription = { unsubscribe(): void };

export interface AuthRepository {
  getSession(): Promise<AuthSession | null>;
  subscribe(
    listener: (event: AuthStateEvent, session: AuthSession | null) => void,
  ): AuthSubscription;
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}
