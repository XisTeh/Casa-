import { Archive, Heart, ListPlus, Pencil, RotateCcw, Search, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { filterProducts, type ProductFilters } from '../../application/catalog-selectors';
import { buildPriceHistoryProjections } from '../../application/price-history-selectors';
import {
  formatCurrencyFromCents,
  formatDateTime,
  formatQuantity,
} from '../../application/locale-formatters';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateView/StateView';
import type { NewProduct, ProductWithLastPurchase } from '../../domain/catalog';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { ProductPriceDetailDialog } from '../history/ProductPriceDetailDialog';
import { usePurchase } from '../purchase/PurchaseContext';
import { CategoryManagerDialog } from './CategoryManagerDialog';
import { useProducts } from './ProductContext';
import { ProductFormDialog } from './ProductFormDialog';
import { ReplenishmentSuggestions } from './ReplenishmentSuggestions';
import { buildProductRecurrenceProfiles } from '../../application/replenishment-selectors';
import { useHousehold } from '../house/HouseContext';

const initialFilters: ProductFilters = {
  query: '',
  categoryId: 'all',
  favoriteOnly: false,
  recurringOnly: false,
  status: 'active',
};

export function ProductPage() {
  const {
    products,
    categories,
    isLoading,
    error,
    createProduct,
    updateProduct,
    setFavorite,
    setActive,
    addToList,
    createCategory,
    renameCategory,
    setCategoryActive,
  } = useProducts();
  const { completedSessions } = usePurchase();
  const { refreshItems } = useShoppingList();
  const { activeHouse } = useHousehold();
  const [filters, setFilters] = useState(initialFilters);
  const [editing, setEditing] = useState<ProductWithLastPurchase | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedPriceIdentity, setSelectedPriceIdentity] = useState<string | null>(null);
  const visibleProducts = useMemo(
    () => filterProducts(products, categories, filters),
    [categories, filters, products],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const priceProjections = useMemo(
    () => buildPriceHistoryProjections(completedSessions, products, categories),
    [categories, completedSessions, products],
  );
  const priceProjectionByProductId = useMemo(
    () => new Map(priceProjections.map((projection) => [projection.productId, projection])),
    [priceProjections],
  );
  const selectedPriceProjection =
    priceProjections.find((projection) => projection.identity === selectedPriceIdentity) ?? null;
  const recurrenceProfiles = useMemo(
    () => buildProductRecurrenceProfiles(products, completedSessions, activeHouse.id),
    [activeHouse.id, completedSessions, products],
  );

  if (isLoading) return <LoadingState description="Abrindo os produtos da casa…" />;
  if (error) return <ErrorState description={error} />;

  async function save(input: NewProduct) {
    if (editing) await updateProduct(editing.id, input);
    else await createProduct(input);
  }

  async function addProduct(product: ProductWithLastPurchase) {
    const result = await addToList(product.id);
    if (result === 'added') await refreshItems();
    setFeedback(
      result === 'added'
        ? `${product.name} foi adicionado à Lista.`
        : `${product.name} já está na Lista.`,
    );
    window.setTimeout(() => setFeedback(null), 3500);
  }

  return (
    <section className="product-page">
      <PageHeader
        eyebrow="Catálogo da casa"
        title="Produtos da casa"
        description="Os itens que fazem parte da rotina da sua casa."
        accessory={
          <Button
            icon={<ListPlus aria-hidden="true" size={19} />}
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            Adicionar produto
          </Button>
        }
      />
      <div className="product-controls">
        <label className="product-search">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Buscar produtos</span>
          <input
            aria-label="Buscar produtos"
            placeholder="Buscar por produto, marca ou categoria"
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({ ...current, query: event.target.value }))
            }
          />
        </label>
        <select
          aria-label="Filtrar por categoria"
          value={filters.categoryId}
          onChange={(event) =>
            setFilters((current) => ({ ...current, categoryId: event.target.value }))
          }
        >
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="product-segment" aria-label="Filtro de produtos">
          <button
            className={!filters.favoriteOnly && !filters.recurringOnly ? 'is-active' : ''}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                favoriteOnly: false,
                recurringOnly: false,
              }))
            }
            type="button"
          >
            Todos
          </button>
          <button
            className={filters.favoriteOnly ? 'is-active' : ''}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                favoriteOnly: true,
                recurringOnly: false,
              }))
            }
            type="button"
          >
            Favoritos
          </button>
          <button
            className={filters.recurringOnly ? 'is-active' : ''}
            onClick={() =>
              setFilters((current) => ({
                ...current,
                favoriteOnly: false,
                recurringOnly: true,
              }))
            }
            type="button"
          >
            Recorrentes
          </button>
        </div>
        <select
          aria-label="Filtrar por status"
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              status: event.target.value as ProductFilters['status'],
            }))
          }
        >
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="all">Todos os status</option>
        </select>
        <Button
          icon={<Settings2 aria-hidden="true" size={18} />}
          onClick={() => setShowCategories(true)}
          variant="secondary"
        >
          Categorias
        </Button>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="product-empty">
          <EmptyState
            title={products.length ? 'Nenhum resultado' : 'Seu catálogo começa aqui'}
            description={
              products.length
                ? 'Nenhum produto corresponde aos filtros.'
                : 'Cadastre o primeiro produto da casa.'
            }
          />
        </div>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((product) => {
            const category = categoryById.get(product.categoryId);
            const priceProjection = priceProjectionByProductId.get(product.id);
            const recurrence = recurrenceProfiles.get(product.id);
            return (
              <article
                className={`product-card ${product.active ? '' : 'is-inactive'}`}
                key={product.id}
              >
                <div className="product-card__top">
                  <div>
                    <h2>{product.name}</h2>
                    <p>{[product.brand, category?.name].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button
                    aria-label={`${product.favorite ? 'Desfavoritar' : 'Favoritar'} ${product.name}`}
                    className={product.favorite ? 'is-favorite' : ''}
                    onClick={() => void setFavorite(product.id, !product.favorite)}
                    type="button"
                  >
                    <Heart
                      aria-hidden="true"
                      fill={product.favorite ? 'currentColor' : 'none'}
                      size={20}
                    />
                  </button>
                </div>
                <p className="product-card__default">
                  {product.defaultQuantity
                    ? `${formatQuantity(product.defaultQuantity)} ${product.defaultUnit}`
                    : product.defaultUnit}
                </p>
                {(product.isRecurring || recurrence?.typicalIntervalDays) && (
                  <p className="product-card__recurrence">
                    <span>{product.isRecurring ? 'Recorrência' : 'Compra média'}</span>
                    <strong>
                      a cada {product.recurrenceDays ?? `~${recurrence?.typicalIntervalDays}`} dias
                    </strong>
                  </p>
                )}
                {product.lastPurchase && priceProjection ? (
                  <button
                    aria-label={`Abrir histórico de preços de ${product.name}`}
                    className="product-card__last product-card__last--button"
                    onClick={() => setSelectedPriceIdentity(priceProjection.identity)}
                    type="button"
                  >
                    <span>
                      Último preço{' '}
                      <strong>
                        {formatCurrencyFromCents(product.lastPurchase.unitPriceCents)}
                      </strong>
                    </span>
                    <span>{product.lastPurchase.storeName}</span>
                    <small>{formatDateTime(product.lastPurchase.purchasedAt)}</small>
                  </button>
                ) : (
                  <p className="product-card__no-price">Ainda sem compra registrada.</p>
                )}
                <div className="product-card__actions">
                  {product.active ? (
                    <Button
                      icon={<ListPlus aria-hidden="true" size={17} />}
                      onClick={() => void addProduct(product)}
                    >
                      Adicionar à lista
                    </Button>
                  ) : (
                    <Button
                      icon={<RotateCcw aria-hidden="true" size={17} />}
                      onClick={() => void setActive(product.id, true)}
                    >
                      Reativar
                    </Button>
                  )}
                  <button
                    aria-label={`Editar ${product.name}`}
                    onClick={() => {
                      setEditing(product);
                      setShowForm(true);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={17} />
                  </button>
                  {product.active && (
                    <button
                      aria-label={`Desativar ${product.name}`}
                      onClick={() => void setActive(product.id, false)}
                      type="button"
                    >
                      <Archive aria-hidden="true" size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ReplenishmentSuggestions />
      {feedback && (
        <div className="shopping-toast" role="status">
          {feedback}
        </div>
      )}
      {showForm && (
        <ProductFormDialog
          categories={categories}
          product={editing}
          onClose={() => setShowForm(false)}
          onSubmit={save}
          onReactivateDuplicate={(id) => setActive(id, true).then(() => undefined)}
        />
      )}
      {showCategories && (
        <CategoryManagerDialog
          categories={categories}
          onClose={() => setShowCategories(false)}
          onCreate={createCategory}
          onRename={renameCategory}
          onSetActive={setCategoryActive}
        />
      )}
      {selectedPriceProjection && (
        <ProductPriceDetailDialog
          onClose={() => setSelectedPriceIdentity(null)}
          projection={selectedPriceProjection}
        />
      )}
    </section>
  );
}
