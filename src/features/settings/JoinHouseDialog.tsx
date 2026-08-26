import { KeyRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';

export function JoinHouseDialog({
  onClose,
  onJoin,
}: {
  onClose(): void;
  onJoin(token: string): Promise<void>;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onJoin(token);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível aceitar o convite.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="join-house-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Casa compartilhada</p>
            <h2 id="join-house-title">Entrar com convite</h2>
          </div>
          <button
            aria-label="Fechar convite"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="settings-field">
            <span>Código do convite</span>
            <input
              autoComplete="off"
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              ref={inputRef}
              value={token}
            />
          </label>
          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}
          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button loading={saving} type="submit">
              <KeyRound aria-hidden="true" size={17} /> Entrar na Casa
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
