import {
  CalendarRange,
  ChevronRight,
  History,
  Search,
  ShoppingBasket,
  Store,
  TrendingUp,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  filterPurchaseHistory,
  groupPurchasesByMonth,
  summarizePurchaseHistory,
  type HistoryFilters,
  type HistoryPeriod,
} from '../../application/history-selectors';
import {
  formatCurrencyFromCents,
  formatDate,
  formatMonthYear,
  formatTime,
} from '../../application/locale-formatters';
import {
  buildPriceHistoryProjections,
  filterPriceHistoryProjections,
  type PriceProjectionFilters,
  type ProductPriceProjection,
} from '../../application/price-history-selectors';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { SelectField } from '../../components/SelectField/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateView/StateView';
import type { PurchaseSession } from '../../domain/purchase';
import { useProducts } from '../products/ProductContext';
import { usePurchase } from '../purchase/PurchaseContext';
import { useStores } from '../stores/StoreContext';
import { PriceHistoryView } from './PriceHistoryView';
import { ProductPriceDetailDialog } from './ProductPriceDetailDialog';
import { PurchaseDetailDialog } from './PurchaseDetailDialog';

const defaultFilters: HistoryFilters = { period: 'all', storeId: '', buyer: '', query: '' };
const priceOrders: PriceProjectionFilters['order'][] = [
  'recent',
  'increase',
  'decrease',
  'lowest',
  'name',
];

export function HistoryPage() {
  const { completedSessions, isLoading, error } = usePurchase();
  const { stores } = useStores();
  const { products, categories, isLoading: productsLoading, error: productsError } = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('visao') === 'precos' ? 'precos' : 'compras';
  const filters: HistoryFilters = useMemo(
    () => ({
      period: (searchParams.get('period') as HistoryPeriod | null) ?? defaultFilters.period,
      storeId: searchParams.get('mercado') ?? '',
      buyer: searchParams.get('comprador') ?? '',
      query: searchParams.get('busca') ?? '',
    }),
    [searchParams],
  );
  const requestedOrder = searchParams.get('ordem') as PriceProjectionFilters['order'] | null;
  const priceFilters: PriceProjectionFilters = useMemo(
    () => ({
      query: searchParams.get('busca') ?? '',
      categoryId: searchParams.get('categoria') ?? '',
      storeId: searchParams.get('mercado') ?? '',
      order: requestedOrder && priceOrders.includes(requestedOrder) ? requestedOrder : 'recent',
    }),
    [requestedOrder, searchParams],
  );
  const priceProjections = useMemo(
    () => buildPriceHistoryProjections(completedSessions, products, categories),
    [categories, completedSessions, products],
  );
  const filteredPriceProjections = useMemo(
    () => filterPriceHistoryProjections(priceProjections, priceFilters),
    [priceFilters, priceProjections],
  );
  const selectedSession =
    completedSessions.find((session) => session.id === searchParams.get('compra')) ?? null;
  const selectedPrice =
    priceProjections.find((projection) => projection.identity === searchParams.get('preco')) ??
    null;
  const filteredSessions = useMemo(
    () => filterPurchaseHistory(completedSessions, filters),
    [completedSessions, filters],
  );
  const summary = useMemo(() => summarizePurchaseHistory(filteredSessions), [filteredSessions]);
  const groups = useMemo(() => groupPurchasesByMonth(filteredSessions), [filteredSessions]);
  const buyers = useMemo(
    () => [...new Set(completedSessions.map((session) => session.purchasedByNameSnapshot))].sort(),
    [completedSessions],
  );

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('compra');
    next.delete('preco');
    setSearchParams(next, { replace: true });
  }

  function switchView(nextView: 'compras' | 'precos') {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'precos') next.set('visao', 'precos');
    else next.delete('visao');
    next.delete('compra');
    next.delete('preco');
    setSearchParams(next, { replace: true });
  }

  function openDetail(session: PurchaseSession) {
    const next = new URLSearchParams(searchParams);
    next.set('compra', session.id);
    setSearchParams(next, { replace: true });
  }

  function openPriceDetail(projection: ProductPriceProjection) {
    const next = new URLSearchParams(searchParams);
    next.set('preco', projection.identity);
    setSearchParams(next, { replace: true });
  }

  function closeDetail(key: 'compra' | 'preco') {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  }

  if (isLoading || productsLoading) {
    return <LoadingState description="Recuperando a memória da Casa…" />;
  }
  if (error || productsError) {
    return (
      <ErrorState description={error ?? productsError ?? 'Não foi possível abrir o histórico.'} />
    );
  }

  return (
    <div className="history-page">
      <PageHeader
        description="Relembre as compras e acompanhe quanto cada produto custou ao longo do tempo."
        eyebrow="Memória da casa"
        title="Histórico"
      />

      <div aria-label="Visualização do histórico" className="history-tabs" role="tablist">
        <button
          aria-selected={view === 'compras'}
          onClick={() => switchView('compras')}
          role="tab"
          type="button"
        >
          <ShoppingBasket aria-hidden="true" size={17} /> Compras
        </button>
        <button
          aria-selected={view === 'precos'}
          onClick={() => switchView('precos')}
          role="tab"
          type="button"
        >
          <TrendingUp aria-hidden="true" size={17} /> Preços
        </button>
      </div>

      {view === 'precos' ? (
        <PriceHistoryView
          allProjectionCount={priceProjections.length}
          categories={categories}
          filters={priceFilters}
          onFilter={updateFilter}
          onOpen={openPriceDetail}
          projections={filteredPriceProjections}
          stores={stores}
        />
      ) : completedSessions.length === 0 ? (
        <section className="history-empty-surface">
          <EmptyState
            description="Compras finalizadas no modo Comprar aparecerão aqui com seus produtos e preços."
            icon={History}
            title="Nenhuma compra por aqui ainda."
          />
        </section>
      ) : (
        <>
          <section aria-label="Resumo do histórico" className="history-summary">
            <div>
              <span>
                <ShoppingBasket aria-hidden="true" size={18} /> Compras realizadas
              </span>
              <strong>{summary.purchaseCount}</strong>
            </div>
            <div>
              <span>
                <WalletCards aria-hidden="true" size={18} /> Total gasto
              </span>
              <strong>{formatCurrencyFromCents(summary.totalSpentCents)}</strong>
            </div>
            <div>
              <span>
                <TrendingUp aria-hidden="true" size={18} /> Média por compra
              </span>
              <strong>{formatCurrencyFromCents(summary.averageSpentCents)}</strong>
            </div>
          </section>

          <section aria-label="Filtros do histórico" className="history-filters">
            <label className="history-search">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">Buscar produto</span>
              <input
                onChange={(event) => updateFilter('busca', event.target.value)}
                placeholder="Buscar produto comprado"
                value={filters.query}
              />
            </label>
            <SelectField
              icon={<CalendarRange aria-hidden="true" size={17} />}
              label="Período"
              onChange={(value) => updateFilter('period', value === 'all' ? '' : value)}
              options={[
                { label: 'Todo o período', value: 'all' },
                { label: 'Últimos 30 dias', value: '30-days' },
                { label: 'Últimos 90 dias', value: '90-days' },
                { label: 'Este ano', value: 'current-year' },
              ]}
              value={filters.period}
            />
            <SelectField
              icon={<Store aria-hidden="true" size={17} />}
              label="Mercado"
              onChange={(value) => updateFilter('mercado', value)}
              options={[
                { label: 'Todos os mercados', value: '' },
                ...stores.map((store) => ({ label: store.name, value: store.id })),
              ]}
              value={filters.storeId}
            />
            <SelectField
              icon={<UserRound aria-hidden="true" size={17} />}
              label="Comprador"
              onChange={(value) => updateFilter('comprador', value)}
              options={[
                { label: 'Todos os compradores', value: '' },
                ...buyers.map((buyer) => ({ label: buyer, value: buyer })),
              ]}
              value={filters.buyer}
            />
          </section>

          {groups.length === 0 ? (
            <section className="history-no-results">
              <Search aria-hidden="true" size={24} />
              <h2>Nenhuma compra encontrada</h2>
              <p>Ajuste os filtros para ver outros registros.</p>
            </section>
          ) : (
            <div className="history-groups">
              {groups.map((group) => (
                <section
                  aria-labelledby={`history-${group.key}`}
                  className="history-group"
                  key={group.key}
                >
                  <h2 id={`history-${group.key}`}>{formatMonthYear(group.date)}</h2>
                  <div className="history-list">
                    {group.sessions.map((session) => {
                      const date = session.completedAt ?? session.startedAt;
                      return (
                        <button
                          className="history-purchase-card"
                          key={session.id}
                          onClick={() => openDetail(session)}
                          type="button"
                        >
                          <span className="history-purchase-card__icon">
                            <ShoppingBasket aria-hidden="true" size={20} />
                          </span>
                          <span className="history-purchase-card__copy">
                            <strong>{session.storeNameSnapshot}</strong>
                            <span>
                              {formatDate(date)} · {formatTime(date)}
                            </span>
                            <small>
                              {session.items.length}{' '}
                              {session.items.length === 1 ? 'produto' : 'produtos'} ·{' '}
                              {session.purchasedByNameSnapshot}
                            </small>
                          </span>
                          <span className="history-purchase-card__total">
                            <strong>{formatCurrencyFromCents(session.totalPriceCents)}</strong>
                            <ChevronRight aria-hidden="true" size={19} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {selectedSession && (
        <PurchaseDetailDialog onClose={() => closeDetail('compra')} session={selectedSession} />
      )}
      {selectedPrice && (
        <ProductPriceDetailDialog onClose={() => closeDetail('preco')} projection={selectedPrice} />
      )}
    </div>
  );
}
