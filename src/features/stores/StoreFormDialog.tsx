import { Store as StoreIcon, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';
import type { NewStore, Store, StoreUpdate } from '../../domain/store';

type StoreFormDialogProps = {
  store?: Store;
  onClose: () => void;
  onSubmit: (input: NewStore | StoreUpdate) => Promise<void>;
};

export function StoreFormDialog({ store, onClose, onSubmit }: StoreFormDialogProps) {
  const [form, setForm] = useState<NewStore>({
    name: store?.name ?? '',
    nickname: store?.nickname ?? '',
    address: store?.address ?? '',
    notes: store?.notes ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="store-form-title"
        aria-modal="true"
        className="shopping-dialog store-form-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">{store ? 'Editar mercado' : 'Novo mercado'}</p>
            <h2 id="store-form-title">{store ? store.name : 'Adicionar mercado'}</h2>
          </div>
          <button
            aria-label="Fechar"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form className="store-form" onSubmit={handleSubmit}>
          <label>
            Nome <span>*</span>
            <div className="store-form__input">
              <StoreIcon aria-hidden="true" size={17} />
              <input
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nome do estabelecimento"
                ref={nameRef}
                required
                value={form.name}
              />
            </div>
          </label>
          <label>
            Apelido
            <input
              onChange={(event) => setForm({ ...form, nickname: event.target.value })}
              placeholder="Ex.: Mercado perto de casa"
              value={form.nickname}
            />
          </label>
          <label>
            Endereço
            <input
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              placeholder="Opcional"
              value={form.address}
            />
          </label>
          <label>
            Observações
            <textarea
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Horários, referência ou algo útil para a casa"
              value={form.notes}
            />
          </label>
          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}
          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="ghost">
              Voltar
            </Button>
            <Button loading={isSaving} type="submit">
              {store ? 'Salvar alterações' : 'Adicionar mercado'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
