import { Home, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Brand } from '../../components/Brand/Brand';
import { Button } from '../../components/Button/Button';

export function OnboardingPage({
  displayName,
  error: providerError,
  onCreate,
  onJoin,
}: {
  displayName: string;
  error: string | null;
  onCreate(name: string): Promise<void>;
  onJoin(token: string): Promise<void>;
}) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') await onCreate(value);
      else await onJoin(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível continuar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="auth-page onboarding-page">
      <section className="auth-card onboarding-card" aria-labelledby="onboarding-title">
        <Brand descriptor="Vida em casa" />
        <div className="auth-card__intro">
          <p className="eyebrow">Bem-vindo ao Casaê</p>
          <h1 id="onboarding-title">Olá, {displayName}.</h1>
          <p>Crie sua primeira Casa ou use um convite enviado por alguém.</p>
        </div>
        {mode === 'choose' ? (
          <div className="onboarding-actions">
            <Button onClick={() => setMode('create')}>
              <Home aria-hidden="true" size={18} /> Criar minha Casa
            </Button>
            <Button onClick={() => setMode('join')} variant="secondary">
              <KeyRound aria-hidden="true" size={18} /> Entrar com convite
            </Button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              <span>{mode === 'create' ? 'Nome da Casa' : 'Código do convite'}</span>
              <input
                autoFocus
                onChange={(event) => setValue(event.target.value)}
                placeholder={
                  mode === 'create' ? 'Ex.: Casa Raabe & Sidney' : 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'
                }
                value={value}
              />
            </label>
            {(error || providerError) && (
              <p className="auth-message auth-message--error" role="alert">
                {error ?? providerError}
              </p>
            )}
            <Button loading={saving} type="submit">
              {mode === 'create' ? 'Criar Casa' : 'Entrar na Casa'}
            </Button>
            <Button
              onClick={() => {
                setMode('choose');
                setError(null);
              }}
              type="button"
              variant="ghost"
            >
              Voltar
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
