import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import type { Store } from '../../domain/store';

export function DeleteStoreDialog({
  store,
  onClose,
  onConfirm,
}: {
  store: Store;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível excluir.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="delete-store-title"
        aria-modal="true"
        className="shopping-dialog shopping-dialog--confirm"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Fechar confirmação"
          className="shopping-dialog__close"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <span className="shopping-dialog__warning">
          <AlertTriangle aria-hidden="true" size={24} />
        </span>
        <p className="eyebrow">Excluir cadastro</p>
        <h2 id="delete-store-title">Excluir {store.name}?</h2>
        <p>Esse mercado ainda não possui compras e pode ser removido com segurança.</p>
        {error && (
          <p className="shopping-form__error" role="alert">
            {error}
          </p>
        )}
        <footer className="shopping-dialog__footer">
          <Button onClick={onClose} type="button" variant="ghost">
            Voltar
          </Button>
          <Button
            className="shopping-button--danger"
            loading={isDeleting}
            onClick={() => void handleDelete()}
            type="button"
          >
            Excluir mercado
          </Button>
        </footer>
      </section>
    </div>
  );
}
