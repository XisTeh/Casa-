import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../application/auth-service';
import type { AuthRepository } from '../domain/auth-repository';
import type { AuthSession } from '../domain/auth';

const session: AuthSession = {
  accessToken: 'token',
  user: { id: 'user-a', email: 'raabe@casae.app' },
};

function repository(): AuthRepository {
  return {
    getSession: vi.fn().mockResolvedValue(session),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    signUp: vi
      .fn()
      .mockResolvedValue({ user: session.user, session, requiresEmailConfirmation: false }),
    signIn: vi.fn().mockResolvedValue(session),
    signOut: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AuthService', () => {
  it('cria conta com nome, e-mail normalizado e confirmação de senha', async () => {
    const fake = repository();
    const service = new AuthService(fake);
    await expect(
      service.signUp(' Raabe ', ' RAABE@CASAE.APP ', '123456', '123456'),
    ).resolves.toMatchObject({ session });
    expect(fake.signUp).toHaveBeenCalledWith('Raabe', 'raabe@casae.app', '123456');
    await expect(service.signUp('Raabe', 'r@c.app', '123456', '654321')).rejects.toThrow(
      /não coincidem/i,
    );
  });

  it('entra, restaura, sai e solicita recuperação', async () => {
    const fake = repository();
    const service = new AuthService(fake);
    await expect(service.getSession()).resolves.toEqual(session);
    await expect(service.signIn(' RAABE@CASAE.APP ', '123456')).resolves.toEqual(session);
    await service.requestPasswordReset('RAABE@CASAE.APP', 'http://localhost/nova-senha');
    await service.signOut();
    expect(fake.requestPasswordReset).toHaveBeenCalledWith(
      'raabe@casae.app',
      'http://localhost/nova-senha',
    );
    expect(fake.signOut).toHaveBeenCalledOnce();
  });

  it('traduz erro de credencial e e-mail já cadastrado', async () => {
    const fake = repository();
    vi.mocked(fake.signIn).mockRejectedValue(
      Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' }),
    );
    vi.mocked(fake.signUp).mockRejectedValue(
      Object.assign(new Error('already registered'), { code: 'user_already_exists' }),
    );
    const service = new AuthService(fake);
    await expect(service.signIn('a@b.com', '123456')).rejects.toThrow(
      'E-mail ou senha incorretos.',
    );
    await expect(service.signUp('Raabe', 'a@b.com', '123456', '123456')).rejects.toThrow(
      'Este e-mail já está cadastrado.',
    );
  });
});
