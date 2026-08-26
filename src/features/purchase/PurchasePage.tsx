import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBasket,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildKnownProducts } from '../../application/known-product-selectors';
import {
  formatCurrencyFromCents,
  formatDateTime,
  formatQuantity,
} from '../../application/locale-formatters';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { ErrorState, LoadingState } from '../../components/StateView/StateView';
import {
  getPurchaseSubtotal,
  isShoppingListPurchaseItem,
  type ManualPurchaseItemInput,
  type PurchaseEntryMode,
  type PurchaseItem,
} from '../../domain/purchase';
import { getShoppingListSummary, type ShoppingListItem } from '../../domain/shopping-list';
import { useShoppingList } from '../shopping-list/ShoppingListContext';
import { useStores } from '../stores/StoreContext';
import { useProducts } from '../products/ProductContext';
import { PurchaseConfirmationDialog } from './PurchaseConfirmationDialog';
import { usePurchase } from './PurchaseContext';
import { PurchaseItemDialog } from './PurchaseItemDialog';
import { QuickPurchaseItemForm } from './QuickPurchaseItemForm';
import { StartPurchaseDialog } from './StartPurchaseDialog';

export function PurchasePage() {
  const { error: shoppingListError, isLoading: isLoadingList, items } = useShoppingList();
  const { activeStores, createStore, error: storesError, isLoading: isLoadingStores } = useStores();
  const { products: catalogProducts, categories, refreshProducts } = useProducts();
  const {
    activeSession,
    addManualItem,
    cancelPurchase,
    completePurchase,
    completedSessions,
    error: purchaseError,
    isLoading: isLoadingPurchase,
    latestCompletedSession,
    markPurchased,
    removePurchaseItem,
    startPurchase,
    undoPurchasedItem,
    updateManualItem,
  } = usePurchase();
  const [startMode, setStartMode] = useState<PurchaseEntryMode | null>(null);
  const [selectedItem, setSelectedItem] = useState<ShoppingListItem | null>(null);
  const [showQuickForm, setShowQuickForm] = useState(false);
  const [editingManualItem, setEditingManualItem] = useState<PurchaseItem | null>(null);
  const [confirmation, setConfirmation] = useState<'cancel' | 'complete' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isLoading = isLoadingList || isLoadingPurchase || isLoadingStores;
  const error = shoppingListError || purchaseError || storesError;
  const shoppingSummary = getShoppingListSummary(items);
  const purchasedIds = useMemo(
    () =>
      new Set(
        activeSession?.items
          .map((item) => item.sourceShoppingItemId)
          .filter((id): id is string => Boolean(id)) ?? [],
      ),
    [activeSession],
  );
  const pendingItems = useMemo(
    () =>
      items
        .filter((item) => item.status === 'pending' && !purchasedIds.has(item.id))
        .sort((first, second) =>
          first.priority === second.priority ? 0 : first.priority === 'high' ? -1 : 1,
        ),
    [items, purchasedIds],
  );
  const usesShoppingList = (activeSession?.entryMode ?? 'list') === 'list';
  const visiblePendingItems = usesShoppingList ? pendingItems : [];
  const knownProducts = useMemo(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const catalog = catalogProducts
      .filter((product) => product.active)
      .map((product) => ({
        identity: product.id,
        productId: product.id,
        name: product.name,
        brand: product.brand,
        category: categoryById.get(product.categoryId)?.legacyKey ?? ('outros' as const),
        categoryName: categoryById.get(product.categoryId)?.name,
        unit: product.defaultUnit,
        defaultQuantity: product.defaultQuantity,
        lastPriceCents: product.lastPurchase?.unitPriceCents,
        lastPurchasedAt: product.lastPurchase?.purchasedAt,
        lastStoreName: product.lastPurchase?.storeName,
      }));
    const ids = new Set(catalog.map((product) => product.productId));
    return [
      ...catalog,
      ...buildKnownProducts(items, completedSessions, activeSession).filter(
        (product) => !ids.has(product.productId),
      ),
    ];
  }, [activeSession, catalogProducts, categories, completedSessions, items]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [activeSession?.id]);

  if (isLoading) {
    return (
      <section className="purchase-state-surface">
        <LoadingState description="Preparando sua compra…" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="purchase-state-surface">
        <ErrorState description={error} />
      </section>
    );
  }

  async function handleStart(store: { id: string; name: string }) {
    const mode = startMode ?? 'list';
    await startPurchase(store, mode);
    setShowQuickForm(mode === 'quick');
    setFeedback(
      mode === 'quick'
        ? `Compra rápida iniciada em ${store.name}.`
        : `Compra iniciada em ${store.name}.`,
    );
  }

  async function handleMarkPurchased(
    item: ShoppingListItem,
    quantity: number,
    unitPriceCents: number,
  ) {
    await markPurchased(item, quantity, unitPriceCents);
    setFeedback(`${item.productName} foi para o carrinho.`);
  }

  async function handleUndo(item: PurchaseItem) {
    try {
      if (!item.sourceShoppingItemId) return;
      await undoPurchasedItem(item.sourceShoppingItemId);
      setFeedback(`${item.productNameSnapshot} voltou para os itens faltantes.`);
    } catch (caughtError) {
      setFeedback(
        caughtError instanceof Error ? caughtError.message : 'Não foi possível desfazer a ação.',
      );
    }
  }

  async function handleAddManual(input: ManualPurchaseItemInput) {
    const session = await addManualItem(input);
    await refreshProducts();
    setFeedback(
      `${session.items.at(-1)?.productNameSnapshot ?? input.productName} foi adicionado.`,
    );
  }

  async function handleUpdateManual(itemId: string, input: ManualPurchaseItemInput) {
    await updateManualItem(itemId, input);
    await refreshProducts();
    setEditingManualItem(null);
    setFeedback(`${input.productName} foi atualizado.`);
  }

  async function handleRemoveManual(item: PurchaseItem) {
    await removePurchaseItem(item.id);
    if (editingManualItem?.id === item.id) setEditingManualItem(null);
    setFeedback(`${item.productNameSnapshot} foi removido do carrinho.`);
  }

  async function handleCancel() {
    await cancelPurchase();
    setFeedback('Compra cancelada. Sua Lista continua intacta.');
  }

  async function handleComplete() {
    const completed = await completePurchase();
    setFeedback(`Compra no ${completed.storeNameSnapshot} finalizada com sucesso.`);
  }

  return (
    <div className={`purchase-page ${activeSession ? 'purchase-page--active' : ''}`}>
      {activeSession ? (
        <>
          <PageHeader
            accessory={
              <Button onClick={() => setConfirmation('cancel')} variant="ghost">
                Cancelar compra
              </Button>
            }
            description={`Iniciada em ${formatDateTime(activeSession.startedAt)}`}
            eyebrow="Comprando"
            title={activeSession.storeNameSnapshot}
          />
          <section aria-label="Resumo da compra" className="purchase-live-summary">
            <div>
              <span>{usesShoppingList ? 'Faltando' : 'Modo'}</span>
              <strong>{usesShoppingList ? visiblePendingItems.length : 'Rápida'}</strong>
            </div>
            <div>
              <span>No carrinho</span>
              <strong>{activeSession.items.length}</strong>
            </div>
            <div className="purchase-live-summary__total">
              <span>Subtotal</span>
              <strong>{formatCurrencyFromCents(getPurchaseSubtotal(activeSession.items))}</strong>
            </div>
          </section>

          <section className="quick-purchase-entry" aria-label="Adicionar item à compra">
            {showQuickForm || !usesShoppingList || editingManualItem ? (
              <QuickPurchaseItemForm
                editingItem={editingManualItem}
                key={editingManualItem?.id ?? 'new-manual-item'}
                knownProducts={knownProducts}
                onCancelEdit={() => setEditingManualItem(null)}
                onCreate={handleAddManual}
                onUpdate={handleUpdateManual}
              />
            ) : (
              <button
                className="quick-purchase-entry__open"
                onClick={() => setShowQuickForm(true)}
                type="button"
              >
                <span>
                  <Plus aria-hidden="true" size={21} />
                </span>
                <span>
                  <strong>Adicionar item</strong>
                  <small>Inclua um produto inesperado sem sair da compra.</small>
                </span>
              </button>
            )}
          </section>

          <div
            className={`purchase-active-layout ${usesShoppingList ? '' : 'purchase-active-layout--quick'}`}
          >
            {usesShoppingList && (
              <section className="purchase-pending" aria-labelledby="purchase-pending-title">
                <header className="purchase-section-header">
                  <span>
                    <ListChecks aria-hidden="true" size={18} />
                  </span>
                  <div>
                    <h2 id="purchase-pending-title">Ainda faltam</h2>
                    <p>Toque no produto para adicionar ao carrinho.</p>
                  </div>
                  <strong>{visiblePendingItems.length}</strong>
                </header>
                {visiblePendingItems.length === 0 ? (
                  <div className="purchase-all-collected">
                    <CheckCircle2 aria-hidden="true" size={26} />
                    <div>
                      <strong>Todos os itens foram conferidos</strong>
                      <span>Você já pode finalizar a compra.</span>
                    </div>
                  </div>
                ) : (
                  <div className="purchase-pending-list">
                    {visiblePendingItems.map((item) => (
                      <button
                        className="purchase-pending-item"
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        type="button"
                      >
                        <span className="purchase-pending-item__check">
                          <Check aria-hidden="true" size={18} />
                        </span>
                        <span className="purchase-pending-item__copy">
                          <span className="purchase-pending-item__title">
                            <strong>{item.productName}</strong>
                            {item.priority === 'high' && (
                              <Badge tone="accent">
                                <AlertTriangle aria-hidden="true" size={11} /> Alta
                              </Badge>
                            )}
                          </span>
                          <small>
                            {formatQuantity(item.quantity)} {item.unit}
                            {item.preferredBrand ? ` · ${item.preferredBrand}` : ''}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="purchase-cart" aria-labelledby="purchase-cart-title">
              <header className="purchase-section-header">
                <span>
                  <ShoppingBasket aria-hidden="true" size={18} />
                </span>
                <div>
                  <h2 id="purchase-cart-title">No carrinho</h2>
                  <p>Itens e valores desta sessão.</p>
                </div>
                <strong>{activeSession.items.length}</strong>
              </header>
              {activeSession.items.length === 0 ? (
                <div className="purchase-cart-empty">
                  <ShoppingBasket aria-hidden="true" size={23} />
                  <span>O carrinho ainda está vazio.</span>
                </div>
              ) : (
                <div className="purchase-cart-list">
                  {activeSession.items.map((item) => (
                    <article className="purchase-cart-item" key={item.id}>
                      <span className="purchase-cart-item__status">
                        <Check aria-hidden="true" size={15} />
                      </span>
                      <div>
                        <strong>{item.productNameSnapshot}</strong>
                        <span>
                          {formatQuantity(item.purchasedQuantity)} {item.unitSnapshot} ·{' '}
                          {formatCurrencyFromCents(item.unitPriceCents)}/{item.unitSnapshot}
                        </span>
                      </div>
                      <div className="purchase-cart-item__end">
                        <strong>{formatCurrencyFromCents(item.totalPriceCents)}</strong>
                        {isShoppingListPurchaseItem(item) ? (
                          <button
                            aria-label={`Desfazer ${item.productNameSnapshot}`}
                            onClick={() => void handleUndo(item)}
                            type="button"
                          >
                            <RotateCcw aria-hidden="true" size={14} /> Desfazer
                          </button>
                        ) : (
                          <span className="purchase-cart-item__manual-actions">
                            <button
                              aria-label={`Editar ${item.productNameSnapshot}`}
                              onClick={() => {
                                setEditingManualItem(item);
                                setShowQuickForm(true);
                              }}
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={14} /> Editar
                            </button>
                            <button
                              aria-label={`Remover ${item.productNameSnapshot}`}
                              onClick={() => void handleRemoveManual(item)}
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={14} /> Remover
                            </button>
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <footer className="purchase-actions">
            <div>
              <span>
                {usesShoppingList
                  ? `${visiblePendingItems.length} ${visiblePendingItems.length === 1 ? 'item continuará' : 'itens continuarão'} na Lista`
                  : 'Sua Lista não será alterada'}
              </span>
              <strong>{formatCurrencyFromCents(getPurchaseSubtotal(activeSession.items))}</strong>
            </div>
            <Button
              disabled={activeSession.items.length === 0}
              onClick={() => setConfirmation('complete')}
            >
              Finalizar compra
            </Button>
          </footer>
        </>
      ) : (
        <>
          <PageHeader
            description="Use sua lista ou registre os produtos conforme coloca no carrinho."
            eyebrow="Compras"
            title="Hora de ir às compras."
          />
          <section className="purchase-start-surface">
            <div className="purchase-start-surface__main">
              <span className="purchase-start-surface__icon">
                <ShoppingBasket aria-hidden="true" size={30} />
              </span>
              <div>
                <p className="eyebrow">Escolha seu ritmo</p>
                <h2>Como você quer comprar hoje?</h2>
              </div>
              <p>
                A Lista é opcional. Em ambos os modos você acompanha itens e subtotal em tempo real.
              </p>
              <div className="purchase-start-options">
                <Button
                  icon={<ShoppingBasket aria-hidden="true" size={19} />}
                  disabled={shoppingSummary.pendingItems === 0}
                  onClick={() => setStartMode('list')}
                >
                  Comprar usando a lista
                </Button>
                <Button
                  icon={<Zap aria-hidden="true" size={19} />}
                  onClick={() => setStartMode('quick')}
                  variant="ghost"
                >
                  Começar compra rápida
                </Button>
              </div>
              {shoppingSummary.pendingItems === 0 && (
                <p className="purchase-start-list-note">
                  Sua lista está vazia — a compra rápida continua disponível.{' '}
                  <Link to="/lista">Organizar lista</Link>
                </p>
              )}
            </div>
            <div className="purchase-start-stats">
              <div>
                <ListChecks aria-hidden="true" size={17} />
                <span>
                  <strong>{shoppingSummary.pendingItems}</strong> itens na lista
                </span>
              </div>
              <div>
                <AlertTriangle aria-hidden="true" size={17} />
                <span>
                  <strong>{shoppingSummary.priorityItems}</strong> prioritários
                </span>
              </div>
            </div>
          </section>

          {latestCompletedSession && (
            <section className="purchase-latest-success" aria-label="Última compra concluída">
              <span className="purchase-latest-success__icon">
                <CheckCircle2 aria-hidden="true" size={22} />
              </span>
              <div>
                <small>Última compra concluída</small>
                <strong>{latestCompletedSession.storeNameSnapshot}</strong>
                <span>
                  <Clock3 aria-hidden="true" size={13} />{' '}
                  {formatDateTime(
                    latestCompletedSession.completedAt ?? latestCompletedSession.startedAt,
                  )}
                </span>
              </div>
              <strong>{formatCurrencyFromCents(latestCompletedSession.totalPriceCents)}</strong>
            </section>
          )}
        </>
      )}

      {feedback && (
        <div className="shopping-toast" role="status">
          {feedback}
        </div>
      )}
      {startMode && (
        <StartPurchaseDialog
          mode={startMode}
          onCreateStore={createStore}
          onClose={() => setStartMode(null)}
          onSubmit={handleStart}
          stores={activeStores}
        />
      )}
      {selectedItem && (
        <PurchaseItemDialog
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSubmit={(quantity, price) => handleMarkPurchased(selectedItem, quantity, price)}
        />
      )}
      {activeSession && confirmation && (
        <PurchaseConfirmationDialog
          mode={confirmation}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmation === 'complete' ? handleComplete : handleCancel}
          remainingItems={visiblePendingItems.length}
          session={activeSession}
          usesShoppingList={usesShoppingList}
        />
      )}
    </div>
  );
}
