import { ArrowDownUp, ChevronRight, Layers3, Search, Store } from 'lucide-react';
import { formatCurrencyFromCents, formatDate } from '../../application/locale-formatters';
import type {
  PriceProjectionFilters,
  ProductPriceProjection,
} from '../../application/price-history-selectors';
import type { Category } from '../../domain/catalog';
import type { Store as StoreType } from '../../domain/store';
import { PriceVariationBadge } from './PriceVariationBadge';

export function PriceHistoryView({
  projections,
  allProjectionCount,
  categories,
  stores,
  filters,
  onFilter,
  onOpen,
}: {
  projections: ProductPriceProjection[];
  allProjectionCount: number;
  categories: Category[];
  stores: StoreType[];
  filters: PriceProjectionFilters;
  onFilter: (key: string, value: string) => void;
  onOpen: (projection: ProductPriceProjection) => void;
}) {
  return (
    <>
      <section
        aria-label="Filtros do histórico de preços"
        className="history-filters price-history-filters"
      >
        <label className="history-search">
          <Search aria-hidden="true" size={17} />
          <span className="sr-only">Buscar produto, marca ou categoria</span>
          <input
            onChange={(event) => onFilter('busca', event.target.value)}
            placeholder="Buscar produto, marca ou categoria"
            value={filters.query}
          />
        </label>
        <label>
          <Layers3 aria-hidden="true" size={17} />
          <span className="sr-only">Categoria</span>
          <select
            onChange={(event) => onFilter('categoria', event.target.value)}
            value={filters.categoryId}
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Store aria-hidden="true" size={17} />
          <span className="sr-only">Mercado</span>
          <select
            onChange={(event) => onFilter('mercado', event.target.value)}
            value={filters.storeId}
          >
            <option value="">Todos os mercados</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <ArrowDownUp aria-hidden="true" size={17} />
          <span className="sr-only">Ordenação</span>
          <select onChange={(event) => onFilter('ordem', event.target.value)} value={filters.order}>
            <option value="recent">Mais recentes</option>
            <option value="increase">Maiores altas</option>
            <option value="decrease">Maiores quedas</option>
            <option value="lowest">Menores preços</option>
            <option value="name">Nome do produto</option>
          </select>
        </label>
      </section>

      {projections.length === 0 ? (
        <section className="history-no-results">
          <Search aria-hidden="true" size={24} />
          <h2>
            {allProjectionCount ? 'Nenhum preço encontrado' : 'Ainda não há preços registrados'}
          </h2>
          <p>
            {allProjectionCount
              ? 'Ajuste os filtros para ver outros produtos.'
              : 'Os preços aparecem depois que uma compra é concluída.'}
          </p>
        </section>
      ) : (
        <div className="price-history-grid">
          {projections.map((projection) => {
            const unit = projection.primaryUnit;
            return (
              <button
                className="price-history-card"
                key={projection.identity}
                onClick={() => onOpen(projection)}
                type="button"
              >
                <span className="price-history-card__top">
                  <span>
                    <strong>{projection.name}</strong>
                    <small>
                      {[projection.brand, projection.categoryName].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <ChevronRight aria-hidden="true" size={19} />
                </span>
                <span className="price-history-card__price">
                  <span>
                    <small>Último preço</small>
                    <strong>
                      {formatCurrencyFromCents(unit.latestRecord.unitPriceCents)}
                      <em>/{unit.unit}</em>
                    </strong>
                  </span>
                  <PriceVariationBadge variation={unit.variation} />
                </span>
                <span className="price-history-card__meta">
                  <span>
                    <Store aria-hidden="true" size={14} /> {unit.latestRecord.storeName}
                  </span>
                  <span>{formatDate(unit.latestRecord.purchasedAt)}</span>
                </span>
                <span className="price-history-card__footer">
                  <span>
                    {unit.recordCount} {unit.recordCount === 1 ? 'registro' : 'registros'} em{' '}
                    {unit.unit}
                  </span>
                  {projection.units.length > 1 && (
                    <span>{projection.units.length} unidades separadas</span>
                  )}
                  {projection.active === false && <span>Produto inativo</span>}
                  {!projection.productId && <span>Registro legado</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
