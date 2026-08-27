import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { AuthService } from '../application/auth-service';
import type { OnlineHouseService } from '../application/online-house-service';
import type { AuthRepository } from '../domain/auth-repository';

describe('App em modo remoto', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'));

  it('protege o aplicativo, autentica e encaminha usuário sem Casa ao onboarding', async () => {
    const repository: AuthRepository = {
      getSession: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      signUp: vi.fn(),
      signIn: vi.fn().mockResolvedValue({
        accessToken: 'token',
        user: { id: 'user-a', email: 'raabe@casae.app' },
      }),
      signOut: vi.fn(),
      requestPasswordReset: vi.fn(),
      updatePassword: vi.fn(),
    };
    const onlineHouseService = {
      getSnapshot: vi.fn().mockResolvedValue({
        profile: {
          id: 'user-a',
          displayName: 'Raabe',
          avatarPath: null,
          avatarSourcePath: null,
          avatarCrop: null,
          avatarRevision: 0,
          avatarUpdatedAt: null,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        houses: [],
        members: [],
      }),
    } as unknown as OnlineHouseService;
    const user = userEvent.setup();
    render(
      <App
        authService={new AuthService(repository)}
        onlineHouseService={onlineHouseService}
        remoteMode
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Entre no Casaê' })).toBeVisible();
    expect(window.location.pathname).toBe('/entrar');
    await user.type(screen.getByLabelText('E-mail'), 'raabe@casae.app');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Olá, Raabe.' })).toBeVisible();
  });
});
