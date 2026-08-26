import { CalendarClock, ListPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildReplenishmentSuggestions } from '../../application/replenishment-selectors';
import { formatDate } from '../../application/locale-formatters';
import { Button } from '../../components/Button/Button';
import { useHousehold } from '../house/HouseContext';
import { usePurchase } from '../purchase/PurchaseContext';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useProducts } from './ProductContext';

type Props = {
  compact?: boolean;
};

export function ReplenishmentSuggestions({ compact = false }: Props) {
  const { activeHouse } = useHousehold();
  const { completedSessions, isLoading: purchasesLoading } = usePurchase();
  const { items, isLoading: listLoading, refreshItems } = useShoppingList();
  const { products, isLoading: productsLoading, addToList } = useProducts();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const suggestions = useMemo(
    () =>
      buildReplenishmentSuggestions(products, completedSessions, items, activeHouse.id, new Date()),
    [activeHouse.id, completedSessions, items, products],
  );
  const visible = compact ? suggestions.slice(0, 3) : suggestions;
  const isLoading = purchasesLoading || listLoading || productsLoading;

  async function addSuggestion(productId: string, productName: string) {
    setAddingId(productId);
    try {
      const result = await addToList(productId);
      if (result === 'added') await refreshItems();
      setFeedback(
        result === 'added'
          ? `${productName} foi adicionado à Lista.`
          : `${productName} já está na Lista.`,
      );
    } finally {
      setAddingId(null);
    }
  }

  if (compact && (isLoading || visible.length === 0)) return null;

  return (
    <section
      aria-labelledby={compact ? 'home-replenishment-title' : 'replenishment-title'}
      className={`replenishment ${compact ? 'replenishment--compact' : 'replenishment--full'}`}
      id="reposicao"
    >
      <header>
        <div>
          <span className="replenishment__icon">
            <CalendarClock aria-hidden="true" size={19} />
          </span>
          <div>
            <p className="eyebrow">Pode estar faltando</p>
            <h2 id={compact ? 'home-replenishment-title' : 'replenishment-title'}>
              Hora de repor?
            </h2>
          </div>
        </div>
        {compact && <Link to="/produtos#reposicao">Ver todos</Link>}
      </header>

      {isLoading ? (
        <p className="replenishment__state">Analisando o histórico da casa…</p>
      ) : visible.length === 0 ? (
        <p className="replenishment__state">
          Nenhum produto atingiu o intervalo de reposição. As sugestões aparecerão aqui sem
          adicionar nada automaticamente.
        </p>
      ) : (
        <div className="replenishment__list">
          {visible.map((suggestion) => (
            <article key={suggestion.product.id}>
              <div className="replenishment__copy">
                <div>
                  <strong>{suggestion.product.name}</strong>
                  <span>
                    {suggestion.source === 'manual' ? 'Recorrência manual' : 'Padrão do histórico'}
                  </span>
                </div>
                <p>{suggestion.reason}</p>
                <small>
                  Última compra em {formatDate(suggestion.lastPurchasedAt!)} · há{' '}
                  {suggestion.daysSinceLastPurchase} dias
                </small>
              </div>
              <Button
                icon={<ListPlus aria-hidden="true" size={17} />}
                loading={addingId === suggestion.product.id}
                onClick={() => void addSuggestion(suggestion.product.id, suggestion.product.name)}
              >
                Adicionar à lista
              </Button>
            </article>
          ))}
        </div>
      )}
      {feedback && (
        <p className="replenishment__feedback" role="status">
          {feedback}
        </p>
      )}
    </section>
  );
}
