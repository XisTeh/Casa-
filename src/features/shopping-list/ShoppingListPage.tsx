import { ListChecks, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  filterShoppingListItems,
  groupShoppingListItems,
  type ShoppingListFilters,
} from '../../application/shopping-list-selectors';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateView/StateView';
import {
  getShoppingListSummary,
  type NewShoppingListItem,
  type ShoppingListItem,
} from '../../domain/shopping-list';
import { useProducts } from '../products/ProductContext';
import { DeleteShoppingItemDialog } from './DeleteShoppingItemDialog';
import { ShoppingListFormDialog } from './ShoppingListFormDialog';
import { ShoppingListItemRow } from './ShoppingListItemRow';
import { useShoppingList } from './ShoppingListContext';
import { shoppingCategoryIcons } from './shopping-list.config';

const initialFilters: ShoppingListFilters = {
  query: '',
  priority: 'all',
  category: 'all',
};

export function ShoppingListPage() {
  const { createItem, error, isLoading, items, removeItem, updateItem } = useShoppingList();
  const { categories, error: catalogError, isLoading: isLoadingCatalog } = useProducts();
  const [filters, setFilters] = useState(initialFilters);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null | undefined>(undefined);
  const [itemToRemove, setItemToRemove] = useState<ShoppingListItem | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const summary = getShoppingListSummary(items);
  const filteredItems = useMemo(() => filterShoppingListItems(items, filters), [filters, items]);
  const groups = useMemo(() => groupShoppingListItems(filteredItems), [filteredItems]);
  const hasActiveFilters =
    filters.query || filters.priority !== 'all' || filters.category !== 'all';

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  function updateFilters(changes: Partial<ShoppingListFilters>) {
    setFilters((currentFilters) => ({ ...currentFilters, ...changes }));
  }

  async function saveItem(input: NewShoppingListItem) {
    if (editingItem) {
      await updateItem(editingItem.id, input);
      setFeedback(`${input.productName.trim()} foi atualizado.`);
      return;
    }

    await createItem(input);
    setFeedback(`${input.productName.trim()} foi adicionado à lista.`);
  }

  async function confirmRemoval() {
    if (!itemToRemove) {
      return;
    }

    await removeItem(itemToRemove.id);
    setFeedback(`${itemToRemove.productName} foi removido da lista.`);
  }

  return (
    <div className="shopping-list-page">
      <PageHeader
        accessory={
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setEditingItem(null)}>
            Adicionar produto
          </Button>
        }
        description="Organize o que está faltando em casa."
        eyebrow="Rotina da casa"
        title="Lista de compras"
      />

      <section aria-label="Resumo da lista" className="shopping-list-summary">
        <div className="shopping-list-summary__mark">
          <ListChecks aria-hidden="true" size={21} />
        </div>
        <div>
          <strong>
            {summary.pendingItems} {summary.pendingItems === 1 ? 'item faltando' : 'itens faltando'}
          </strong>
          <span>
            {summary.priorityItems > 0
              ? `${summary.priorityItems} ${summary.priorityItems === 1 ? 'item prioritário' : 'itens prioritários'}`
              : 'Nenhum item prioritário'}
          </span>
        </div>
      </section>

      <section aria-label="Controles da lista" className="shopping-list-controls">
        <label className="shopping-search">
          <Search aria-hidden="true" size={18} />
          <span className="visually-hidden">Buscar produto, marca ou categoria</span>
          <input
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Buscar produto, marca ou categoria"
            type="search"
            value={filters.query}
          />
          {filters.query && (
            <button
              aria-label="Limpar busca"
              onClick={() => updateFilters({ query: '' })}
              type="button"
            >
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </label>
        <div className="shopping-filter-bar">
          <SlidersHorizontal aria-hidden="true" size={16} />
          <button
            aria-pressed={filters.priority === 'all'}
            className={filters.priority === 'all' ? 'is-active' : ''}
            onClick={() => updateFilters({ priority: 'all' })}
            type="button"
          >
            Todos
          </button>
          <button
            aria-pressed={filters.priority === 'high'}
            className={filters.priority === 'high' ? 'is-active' : ''}
            onClick={() =>
              updateFilters({ priority: filters.priority === 'high' ? 'all' : 'high' })
            }
            type="button"
          >
            Prioridade alta
          </button>
          <label className="shopping-category-filter">
            <span className="visually-hidden">Filtrar por categoria</span>
            <select
              onChange={(event) => updateFilters({ category: event.target.value })}
              value={filters.category}
            >
              <option value="all">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {isLoading || isLoadingCatalog ? (
        <section className="shopping-list-surface">
          <LoadingState description="Abrindo a lista da Casa…" />
        </section>
      ) : error || catalogError ? (
        <section className="shopping-list-surface">
          <ErrorState description={(error ?? catalogError)!} />
        </section>
      ) : items.length === 0 ? (
        <section className="shopping-list-surface shopping-list-surface--empty">
          <EmptyState
            action={
              <Button
                icon={<Plus aria-hidden="true" size={18} />}
                onClick={() => setEditingItem(null)}
              >
                Adicionar produto
              </Button>
            }
            description="Adicione o que está faltando em casa e deixe tudo organizado para a próxima compra."
            eyebrow="Lista da Casa"
            icon={ListChecks}
            title="Sua lista está vazia"
          />
        </section>
      ) : groups.length === 0 ? (
        <section className="shopping-list-surface shopping-list-surface--no-results">
          <span className="shopping-list-no-results__icon">
            <Search aria-hidden="true" size={22} />
          </span>
          <div>
            <h2>Nenhum produto encontrado</h2>
            <p>Tente outro termo ou ajuste os filtros da lista.</p>
          </div>
          {hasActiveFilters && (
            <Button onClick={() => setFilters(initialFilters)} variant="subtle">
              Limpar filtros
            </Button>
          )}
        </section>
      ) : (
        <div className="shopping-category-groups">
          {groups.map((group) => {
            const Icon = shoppingCategoryIcons[group.category];

            return (
              <section
                aria-labelledby={`category-${group.key}`}
                className="shopping-category-group"
                key={group.key}
              >
                <header className="shopping-category-group__header">
                  <span className="shopping-category-group__icon">
                    <Icon aria-hidden="true" size={17} />
                  </span>
                  <h2 id={`category-${group.key}`}>{group.label}</h2>
                  <span>{group.items.length}</span>
                </header>
                <div className="shopping-category-group__items">
                  {group.items.map((item) => (
                    <ShoppingListItemRow
                      item={item}
                      key={item.id}
                      onEdit={setEditingItem}
                      onRemove={setItemToRemove}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {feedback && (
        <div className="shopping-toast" role="status">
          {feedback}
        </div>
      )}
      {editingItem !== undefined && (
        <ShoppingListFormDialog
          categories={categories}
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onSubmit={saveItem}
        />
      )}
      {itemToRemove && (
        <DeleteShoppingItemDialog
          item={itemToRemove}
          onClose={() => setItemToRemove(null)}
          onConfirm={confirmRemoval}
        />
      )}
    </div>
  );
}
