import { ArrowLeft, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Brand } from '../../components/Brand/Brand';
import { Button } from '../../components/Button/Button';
import { useAuth } from './AuthContext';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot' | 'new-password';

const copy = {
  'sign-in': { eyebrow: 'Bem-vindo de volta', title: 'Entre no Casaê' },
  'sign-up': { eyebrow: 'Sua casa começa aqui', title: 'Crie sua conta' },
  forgot: { eyebrow: 'Recuperar acesso', title: 'Redefina sua senha' },
  'new-password': { eyebrow: 'Nova senha', title: 'Proteja sua conta' },
} as const;

export function AuthPage({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (mode === 'new-password' && !auth.session && !auth.passwordRecovery && !auth.initializing) {
    return <Navigate replace to="/recuperar-senha" />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      if (mode === 'sign-in') await auth.signIn(email, password);
      if (mode === 'sign-up') {
        const confirmationRequired = await auth.signUp(name, email, password, confirmation);
        if (confirmationRequired) {
          setFeedback('Confira seu e-mail para confirmar a conta e depois entre no Casaê.');
        }
      }
      if (mode === 'forgot') {
        await auth.requestPasswordReset(email);
        setFeedback('Enviamos as instruções de recuperação para seu e-mail.');
      }
      if (mode === 'new-password') {
        await auth.updatePassword(password, confirmation);
        setFeedback('Senha atualizada. Você já pode continuar no Casaê.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível continuar.');
    } finally {
      setSaving(false);
    }
  }

  const Icon = mode === 'sign-up' ? UserPlus : mode === 'sign-in' ? LogIn : KeyRound;
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Brand descriptor="Vida em casa" />
        <div className="auth-card__intro">
          <span className="auth-card__icon">
            <Icon aria-hidden="true" size={22} />
          </span>
          <p className="eyebrow">{copy[mode].eyebrow}</p>
          <h1 id="auth-title">{copy[mode].title}</h1>
          <p>Uma conta por pessoa, com as Casas e rotinas certas para cada família.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'sign-up' && (
            <label>
              <span>Nome</span>
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          )}
          {mode !== 'new-password' && (
            <label>
              <span>E-mail</span>
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
          )}
          {(mode === 'sign-in' || mode === 'sign-up' || mode === 'new-password') && (
            <label>
              <span>{mode === 'new-password' ? 'Nova senha' : 'Senha'}</span>
              <input
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
          )}
          {(mode === 'sign-up' || mode === 'new-password') && (
            <label>
              <span>Confirmar senha</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                value={confirmation}
              />
            </label>
          )}
          {error && (
            <p className="auth-message auth-message--error" role="alert">
              {error}
            </p>
          )}
          {feedback && (
            <p className="auth-message auth-message--success" role="status">
              {feedback}
            </p>
          )}
          <Button loading={saving} type="submit">
            {mode === 'sign-in'
              ? 'Entrar'
              : mode === 'sign-up'
                ? 'Criar conta'
                : mode === 'forgot'
                  ? 'Enviar instruções'
                  : 'Salvar nova senha'}
          </Button>
        </form>
        <footer className="auth-card__footer">
          {mode === 'sign-in' && (
            <>
              <Link to="/recuperar-senha">Esqueci minha senha</Link>
              <span>
                Ainda não tem conta? <Link to="/criar-conta">Criar conta</Link>
              </span>
            </>
          )}
          {mode === 'sign-up' && (
            <Link to="/entrar">
              <ArrowLeft aria-hidden="true" size={16} /> Voltar para entrar
            </Link>
          )}
          {mode === 'forgot' && (
            <Link to="/entrar">
              <ArrowLeft aria-hidden="true" size={16} /> Voltar para entrar
            </Link>
          )}
          {mode === 'new-password' && feedback && <Link to="/">Continuar no Casaê</Link>}
        </footer>
      </section>
    </main>
  );
}
