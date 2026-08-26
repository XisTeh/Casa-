import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button/Button';
import type { ShoppingListItem } from '../../domain/shopping-list';

type DeleteShoppingItemDialogProps = {
  item: ShoppingListItem;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteShoppingItemDialog({
  item,
  onClose,
  onConfirm,
}: DeleteShoppingItemDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  async function handleConfirm() {
    setIsRemoving(true);

    try {
      await onConfirm();
      onClose();
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="remove-item-title"
        aria-modal="true"
        className="shopping-dialog shopping-dialog--confirm"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Fechar confirmação"
          className="shopping-dialog__close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <span className="shopping-dialog__warning">
          <AlertTriangle aria-hidden="true" size={24} />
        </span>
        <p className="eyebrow">Remover da lista</p>
        <h2 id="remove-item-title">Remover {item.productName} da lista?</h2>
        <p>Esta ação remove somente este item da lista da Casa.</p>
        <footer className="shopping-dialog__footer">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            className="shopping-button--danger"
            loading={isRemoving}
            onClick={() => void handleConfirm()}
            type="button"
          >
            Remover
          </Button>
        </footer>
      </section>
    </div>
  );
}
