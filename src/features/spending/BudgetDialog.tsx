import { CalendarDays, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  formatCurrencyFromCents,
  parseBrazilianCurrencyToCents,
} from '../../application/locale-formatters';
import type { HouseBudget } from '../../domain/budget';
import { Button } from '../../components/Button/Button';
import type { MonthPeriod } from '../../application/spending-selectors';

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function BudgetDialog({
  period,
  budget,
  onClose,
  onSave,
}: {
  period: MonthPeriod;
  budget?: HouseBudget;
  onClose: () => void;
  onSave: (amountCents: number) => Promise<void>;
}) {
  const [value, setValue] = useState(
    budget ? (budget.amountCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const periodName = monthFormatter.format(new Date(period.year, period.month - 1, 1));

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseBrazilianCurrencyToCents(value);
    if (amountCents === null || amountCents <= 0) {
      setError('Informe um orçamento maior que zero.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave(amountCents);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o orçamento.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="budget-dialog-title"
        aria-modal="true"
        className="shopping-dialog budget-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Planejamento da casa</p>
            <h2 id="budget-dialog-title">{budget ? 'Editar orçamento' : 'Definir orçamento'}</h2>
          </div>
          <button
            aria-label="Fechar orçamento"
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <p className="budget-dialog__period">
          <CalendarDays aria-hidden="true" size={17} /> Orçamento de {periodName}
        </p>
        <form onSubmit={submit}>
          <label className="budget-dialog__field">
            <span>Orçamento do mês</span>
            <span className="budget-dialog__currency">
              <span>R$</span>
              <input
                aria-label="Orçamento do mês"
                inputMode="decimal"
                onChange={(event) => setValue(event.target.value)}
                placeholder="0,00"
                value={value}
              />
            </span>
          </label>
          {budget && <small>Valor atual: {formatCurrencyFromCents(budget.amountCents)}</small>}
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
              Salvar orçamento
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
