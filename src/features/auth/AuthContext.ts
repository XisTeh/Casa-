import { createContext, useContext } from 'react';
import type { AuthSession } from '../../domain/auth';

export type AuthContextValue = {
  session: AuthSession | null;
  initializing: boolean;
  passwordRecovery: boolean;
  signUp(name: string, email: string, password: string, confirmation: string): Promise<boolean>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string, confirmation: string): Promise<void>;
};

export const authContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(authContext);
  if (!value) throw new Error('AuthProvider não encontrado.');
  return value;
}

export function useOptionalAuth() {
  return useContext(authContext);
}
