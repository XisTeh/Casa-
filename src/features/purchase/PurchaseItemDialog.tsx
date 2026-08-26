import { Calculator, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  calculateItemTotalCents,
  formatCurrencyFromCents,
  formatQuantity,
  parseBrazilianCurrencyToCents,
  parseBrazilianDecimal,
} from '../../application/locale-formatters';
import { Button } from '../../components/Button/Button';
import type { ShoppingListItem } from '../../domain/shopping-list';

type PurchaseItemDialogProps = {
  item: ShoppingListItem;
  onClose: () => void;
  onSubmit: (quantity: number, unitPriceCents: number) => Promise<void>;
};

export function PurchaseItemDialog({ item, onClose, onSubmit }: PurchaseItemDialogProps) {
  const [quantity, setQuantity] = useState(formatQuantity(item.quantity));
  const [unitPrice, setUnitPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const parsedQuantity = parseBrazilianDecimal(quantity);
  const unitPriceCents = parseBrazilianCurrencyToCents(unitPrice);
  const totalPriceCents = useMemo(
    () =>
      parsedQuantity !== null && unitPriceCents !== null
        ? calculateItemTotalCents(parsedQuantity, unitPriceCents)
        : 0,
    [parsedQuantity, unitPriceCents],
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    quantityInputRef.current?.focus();
    quantityInputRef.current?.select();

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

    if (parsedQuantity === null || parsedQuantity <= 0) {
      setError('Informe uma quantidade válida.');
      return;
    }

    if (unitPriceCents === null) {
      setError('Informe o preço unitário.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSubmit(parsedQuantity, unitPriceCents);
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível adicionar.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="purchase-item-title"
        aria-modal="true"
        className="shopping-dialog purchase-item-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Adicionar ao carrinho</p>
            <h2 id="purchase-item-title">{item.productName}</h2>
            <p className="purchase-item-dialog__meta">
              Planejado: {formatQuantity(item.quantity)} {item.unit}
              {item.preferredBrand ? ` · ${item.preferredBrand}` : ''}
            </p>
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
        <form className="purchase-item-form" onSubmit={handleSubmit}>
          <div className="purchase-item-form__field">
            <label htmlFor="purchased-quantity">Quantidade comprada</label>
            <div className="purchase-quantity-input">
              <input
                id="purchased-quantity"
                inputMode="decimal"
                onChange={(event) => setQuantity(event.target.value)}
                ref={quantityInputRef}
                required
                value={quantity}
              />
              <span>{item.unit}</span>
            </div>
          </div>
          <div className="purchase-item-form__field">
            <label htmlFor="purchase-unit-price">Preço por {item.unit}</label>
            <div className="purchase-price-input">
              <span>R$</span>
              <input
                id="purchase-unit-price"
                inputMode="decimal"
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="0,00"
                required
                value={unitPrice}
              />
            </div>
          </div>
          <div className="purchase-calculated-total" aria-live="polite">
            <span className="purchase-calculated-total__icon">
              <Calculator aria-hidden="true" size={19} />
            </span>
            <span>Total</span>
            <strong>{formatCurrencyFromCents(totalPriceCents)}</strong>
          </div>
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
              Adicionar ao carrinho
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
