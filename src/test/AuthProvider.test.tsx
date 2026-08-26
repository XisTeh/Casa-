import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../application/auth-service';
import type { AuthRepository } from '../domain/auth-repository';
import type { AuthSession, AuthStateEvent } from '../domain/auth';
import { AuthProvider } from '../features/auth/AuthProvider';
import { useAuth } from '../features/auth/AuthContext';

function Status() {
  const { initializing, session } = useAuth();
  return <p>{initializing ? 'inicializando' : (session?.user.email ?? 'sem sessão')}</p>;
}

describe('AuthProvider', () => {
  it('restaura sessão, reage entre abas e remove a única subscription no cleanup', async () => {
    let listener: ((event: AuthStateEvent, session: AuthSession | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const restored: AuthSession = { accessToken: 'a', user: { id: 'a', email: 'a@casae.app' } };
    const repository: AuthRepository = {
      getSession: vi.fn().mockResolvedValue(restored),
      subscribe: vi.fn((next) => {
        listener = next;
        return { unsubscribe };
      }),
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      requestPasswordReset: vi.fn(),
      updatePassword: vi.fn(),
    };
    const { unmount } = render(
      <AuthProvider service={new AuthService(repository)}>
        <Status />
      </AuthProvider>,
    );
    expect(screen.getByText('inicializando')).toBeVisible();
    expect(await screen.findByText('a@casae.app')).toBeVisible();
    act(() => listener?.('SIGNED_OUT', null));
    expect(screen.getByText('sem sessão')).toBeVisible();
    expect(repository.subscribe).toHaveBeenCalledOnce();
    unmount();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });
});
