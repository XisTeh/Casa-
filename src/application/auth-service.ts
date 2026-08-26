import type { AuthRepository } from '../domain/auth-repository';

function required(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`Informe ${label}.`);
  return clean;
}

export function friendlyAuthError(caught: unknown) {
  const error = caught as { code?: string; message?: string };
  const code = error?.code ?? '';
  const message = error?.message?.toLocaleLowerCase('en-US') ?? '';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return new Error('E-mail ou senha incorretos.');
  }
  if (
    code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return new Error('Este e-mail já está cadastrado.');
  }
  if (code === 'over_email_send_rate_limit' || message.includes('rate limit')) {
    return new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return new Error('Use uma senha com pelo menos 6 caracteres.');
  }
  return new Error('Não foi possível concluir a autenticação. Tente novamente.');
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  getSession() {
    return this.repository.getSession();
  }

  subscribe(listener: Parameters<AuthRepository['subscribe']>[0]) {
    return this.repository.subscribe(listener);
  }

  async signUp(name: string, email: string, password: string, confirmation: string) {
    const cleanName = required(name, 'seu nome');
    const cleanEmail = required(email, 'seu e-mail').toLocaleLowerCase('en-US');
    if (password.length < 6) throw new Error('Use uma senha com pelo menos 6 caracteres.');
    if (password !== confirmation) throw new Error('As senhas não coincidem.');
    try {
      return await this.repository.signUp(cleanName, cleanEmail, password);
    } catch (caught) {
      throw friendlyAuthError(caught);
    }
  }

  async signIn(email: string, password: string) {
    try {
      return await this.repository.signIn(
        required(email, 'seu e-mail').toLocaleLowerCase('en-US'),
        required(password, 'sua senha'),
      );
    } catch (caught) {
      throw friendlyAuthError(caught);
    }
  }

  async signOut() {
    try {
      await this.repository.signOut();
    } catch (caught) {
      throw friendlyAuthError(caught);
    }
  }

  async requestPasswordReset(email: string, redirectTo: string) {
    try {
      await this.repository.requestPasswordReset(
        required(email, 'seu e-mail').toLocaleLowerCase('en-US'),
        redirectTo,
      );
    } catch (caught) {
      throw friendlyAuthError(caught);
    }
  }

  async updatePassword(password: string, confirmation: string) {
    if (password.length < 6) throw new Error('Use uma senha com pelo menos 6 caracteres.');
    if (password !== confirmation) throw new Error('As senhas não coincidem.');
    try {
      await this.repository.updatePassword(password);
    } catch (caught) {
      throw friendlyAuthError(caught);
    }
  }
}
