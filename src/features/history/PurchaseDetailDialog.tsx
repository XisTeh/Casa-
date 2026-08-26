import {
  CalendarDays,
  CircleUserRound,
  MapPin,
  ReceiptText,
  ShoppingBasket,
  X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  formatCurrencyFromCents,
  formatDate,
  formatQuantity,
  formatTime,
} from '../../application/locale-formatters';
import { shoppingCategoryLabels } from '../../domain/shopping-list';
import type { PurchaseSession } from '../../domain/purchase';

export function PurchaseDetailDialog({
  session,
  onClose,
}: {
  session: PurchaseSession;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const date = session.completedAt ?? session.startedAt;

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

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="purchase-detail-title"
        aria-modal="true"
        className="shopping-dialog purchase-detail-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="purchase-detail-header">
          <div>
            <p className="eyebrow">Compra concluída</p>
            <h2 id="purchase-detail-title">{session.storeNameSnapshot}</h2>
          </div>
          <button
            aria-label="Fechar detalhe"
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="purchase-detail-facts">
          <span>
            <CalendarDays aria-hidden="true" size={16} /> {formatDate(date)} às {formatTime(date)}
          </span>
          <span>
            <CircleUserRound aria-hidden="true" size={16} /> {session.purchasedByNameSnapshot}
          </span>
          <span>
            <ShoppingBasket aria-hidden="true" size={16} /> {session.items.length}{' '}
            {session.items.length === 1 ? 'produto' : 'produtos'}
          </span>
          <strong>{formatCurrencyFromCents(session.totalPriceCents)}</strong>
        </div>
        <div className="purchase-detail-items" aria-label="Produtos comprados">
          {session.items.map((item) => (
            <article className="purchase-detail-item" key={item.id}>
              <span className="purchase-detail-item__icon">
                <ReceiptText aria-hidden="true" size={17} />
              </span>
              <div className="purchase-detail-item__copy">
                <strong>{item.productNameSnapshot}</strong>
                <span>
                  {formatQuantity(item.purchasedQuantity)} {item.unitSnapshot}
                  {item.brandSnapshot ? ` · ${item.brandSnapshot}` : ''}
                </span>
                <small>
                  {item.categoryNameSnapshot ?? shoppingCategoryLabels[item.categorySnapshot]}
                </small>
                {item.notesSnapshot && <p>{item.notesSnapshot}</p>}
              </div>
              <div className="purchase-detail-item__price">
                <strong>{formatCurrencyFromCents(item.totalPriceCents)}</strong>
                <span>
                  {formatCurrencyFromCents(item.unitPriceCents)}/{item.unitSnapshot}
                </span>
              </div>
            </article>
          ))}
        </div>
        <footer className="purchase-detail-footer">
          <MapPin aria-hidden="true" size={15} />
          Nome do mercado preservado no momento da compra
        </footer>
      </section>
    </div>
  );
}
