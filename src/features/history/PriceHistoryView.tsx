import { ArrowDownUp, ChevronRight, Layers3, Search, Store } from 'lucide-react';
import { formatCurrencyFromCents, formatDate } from '../../application/locale-formatters';
import type {
  PriceProjectionFilters,
  ProductPriceProjection,
} from '../../application/price-history-selectors';
import type { Category } from '../../domain/catalog';
import type { Store as StoreType } from '../../domain/store';
import { SelectField } from '../../components/SelectField/SelectField';
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
        <SelectField
          icon={<Layers3 aria-hidden="true" size={17} />}
          label="Categoria"
          onChange={(value) => onFilter('categoria', value)}
          options={[
            { label: 'Todas as categorias', value: '' },
            ...categories.map((category) => ({ label: category.name, value: category.id })),
          ]}
          value={filters.categoryId}
        />
        <SelectField
          icon={<Store aria-hidden="true" size={17} />}
          label="Mercado"
          onChange={(value) => onFilter('mercado', value)}
          options={[
            { label: 'Todos os mercados', value: '' },
            ...stores.map((store) => ({ label: store.name, value: store.id })),
          ]}
          value={filters.storeId}
        />
        <SelectField
          icon={<ArrowDownUp aria-hidden="true" size={17} />}
          label="Ordenação"
          onChange={(value) => onFilter('ordem', value)}
          options={[
            { label: 'Mais recentes', value: 'recent' },
            { label: 'Maiores altas', value: 'increase' },
            { label: 'Maiores quedas', value: 'decrease' },
            { label: 'Menores preços', value: 'lowest' },
            { label: 'Nome do produto', value: 'name' },
          ]}
          value={filters.order}
        />
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
