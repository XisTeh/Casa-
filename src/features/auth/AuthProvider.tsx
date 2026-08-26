import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthService } from '../../application/auth-service';
import type { AuthSession } from '../../domain/auth';
import { authContext } from './AuthContext';

export function AuthProvider({ children, service }: { children: ReactNode; service: AuthService }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    const subscription = service.subscribe((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setPasswordRecovery(event === 'PASSWORD_RECOVERY');
      setInitializing(false);
    });
    service
      .getSession()
      .then((restored) => active && setSession(restored))
      .finally(() => active && setInitializing(false));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [service]);

  const value = useMemo(
    () => ({
      session,
      initializing,
      passwordRecovery,
      signUp: async (name: string, email: string, password: string, confirmation: string) => {
        const result = await service.signUp(name, email, password, confirmation);
        if (result.session) setSession(result.session);
        return result.requiresEmailConfirmation;
      },
      signIn: async (email: string, password: string) => {
        setSession(await service.signIn(email, password));
      },
      signOut: async () => {
        await service.signOut();
        setSession(null);
      },
      requestPasswordReset: (email: string) =>
        service.requestPasswordReset(email, `${window.location.origin}/nova-senha`),
      updatePassword: async (password: string, confirmation: string) => {
        await service.updatePassword(password, confirmation);
        setPasswordRecovery(false);
      },
    }),
    [initializing, passwordRecovery, service, session],
  );

  return <authContext.Provider value={value}>{children}</authContext.Provider>;
}
