import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { authContext, type AuthContextValue } from '../features/auth/AuthContext';
import { AuthPage } from '../features/auth/AuthPage';

function value(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    session: null,
    initializing: false,
    passwordRecovery: false,
    signUp: vi.fn().mockResolvedValue(false),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage(mode: 'sign-in' | 'sign-up' | 'forgot', context = value()) {
  render(
    <authContext.Provider value={context}>
      <MemoryRouter>
        <AuthPage mode={mode} />
      </MemoryRouter>
    </authContext.Provider>,
  );
  return context;
}

describe('AuthPage', () => {
  it('envia login por e-mail e senha', async () => {
    const user = userEvent.setup();
    const context = renderPage('sign-in');
    await user.type(screen.getByLabelText('E-mail'), 'raabe@casae.app');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(context.signIn).toHaveBeenCalledWith('raabe@casae.app', '123456');
  });

  it('cria conta e mostra confirmação por e-mail', async () => {
    const user = userEvent.setup();
    const context = renderPage('sign-up', value({ signUp: vi.fn().mockResolvedValue(true) }));
    await user.type(screen.getByLabelText('Nome'), 'Raabe');
    await user.type(screen.getByLabelText('E-mail'), 'raabe@casae.app');
    await user.type(screen.getByLabelText('Senha'), '123456');
    await user.type(screen.getByLabelText('Confirmar senha'), '123456');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(context.signUp).toHaveBeenCalledWith('Raabe', 'raabe@casae.app', '123456', '123456');
    expect(screen.getByRole('status')).toHaveTextContent(/confira seu e-mail/i);
  });

  it('solicita recuperação e apresenta erro amigável', async () => {
    const user = userEvent.setup();
    const context = renderPage('forgot');
    await user.type(screen.getByLabelText('E-mail'), 'raabe@casae.app');
    await user.click(screen.getByRole('button', { name: 'Enviar instruções' }));
    expect(context.requestPasswordReset).toHaveBeenCalledWith('raabe@casae.app');
    expect(screen.getByRole('status')).toHaveTextContent(/enviamos as instruções/i);
  });
});
