import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatCurrencyFromCents } from '../../application/locale-formatters';
import { Button } from '../../components/Button/Button';
import type { PurchaseSession } from '../../domain/purchase';

type PurchaseConfirmationDialogProps = {
  mode: 'cancel' | 'complete';
  remainingItems: number;
  session: PurchaseSession;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  usesShoppingList: boolean;
};

export function PurchaseConfirmationDialog({
  mode,
  remainingItems,
  session,
  onClose,
  onConfirm,
  usesShoppingList,
}: PurchaseConfirmationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isComplete = mode === 'complete';

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function handleConfirm() {
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Não foi possível concluir a ação.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="purchase-confirm-title"
        aria-modal="true"
        className="shopping-dialog shopping-dialog--confirm purchase-confirm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Fechar confirmação"
          className="shopping-dialog__close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <span className={`shopping-dialog__warning ${isComplete ? 'is-success' : ''}`}>
          {isComplete ? (
            <CheckCircle2 aria-hidden="true" size={25} />
          ) : (
            <AlertTriangle aria-hidden="true" size={24} />
          )}
        </span>
        <p className="eyebrow">{isComplete ? 'Concluir compra' : 'Descartar sessão'}</p>
        <h2 id="purchase-confirm-title">
          {isComplete ? 'Finalizar compra?' : 'Cancelar esta compra?'}
        </h2>
        {isComplete ? (
          <div className="purchase-confirm-summary">
            <strong>{session.storeNameSnapshot}</strong>
            <span>
              {session.items.length}{' '}
              {session.items.length === 1 ? 'item comprado' : 'itens comprados'}
            </span>
            <strong>
              {formatCurrencyFromCents(
                session.items.reduce((total, item) => total + item.totalPriceCents, 0),
              )}
            </strong>
            <p>
              {usesShoppingList
                ? `${remainingItems} ${remainingItems === 1 ? 'item continuará' : 'itens continuarão'} na sua lista.`
                : 'Sua Lista não será alterada por esta compra rápida.'}
            </p>
          </div>
        ) : (
          <p>
            Os produtos originais continuarão na Lista. Os preços registrados nesta sessão serão
            descartados.
          </p>
        )}
        {error ? (
          <p className="shopping-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="shopping-dialog__footer">
          <Button onClick={onClose} type="button" variant="ghost">
            Voltar
          </Button>
          <Button
            className={isComplete ? '' : 'shopping-button--danger'}
            loading={isSubmitting}
            onClick={() => void handleConfirm()}
            type="button"
          >
            {isComplete ? 'Finalizar compra' : 'Cancelar compra'}
          </Button>
        </footer>
      </section>
    </div>
  );
}
