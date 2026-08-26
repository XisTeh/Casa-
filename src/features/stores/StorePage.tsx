import {
  Building2,
  CalendarDays,
  MapPin,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ReceiptText,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { formatCurrencyFromCents, formatDateTime } from '../../application/locale-formatters';
import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateView/StateView';
import type { NewStore, StoreWithStats, StoreUpdate } from '../../domain/store';
import { DeleteStoreDialog } from './DeleteStoreDialog';
import { StoreFormDialog } from './StoreFormDialog';
import { useStores } from './StoreContext';

export function StorePage() {
  const { stores, isLoading, error, createStore, updateStore, setStoreActive, removeStore } =
    useStores();
  const [editingStore, setEditingStore] = useState<StoreWithStats | null>(null);
  const [deletingStore, setDeletingStore] = useState<StoreWithStats | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <LoadingState description="Organizando os mercados da Casa…" />;
  if (error) return <ErrorState description={error} />;

  async function handleCreate(input: NewStore | StoreUpdate) {
    await createStore(input as NewStore);
  }

  async function handleUpdate(input: NewStore | StoreUpdate) {
    if (editingStore) await updateStore(editingStore.id, input);
  }

  async function handleSetActive(store: StoreWithStats) {
    setActionError(null);
    try {
      await setStoreActive(store.id, !store.active);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : 'Não foi possível alterar o mercado.',
      );
    }
  }

  return (
    <div className="stores-page">
      <PageHeader
        accessory={
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={() => setShowCreate(true)}>
            Adicionar mercado
          </Button>
        }
        description="Os lugares onde sua casa costuma comprar."
        eyebrow="Casa & rotina"
        title="Mercados"
      />
      {actionError && (
        <p className="stores-action-error" role="alert">
          {actionError}
        </p>
      )}

      {stores.length === 0 ? (
        <section className="stores-empty-surface">
          <EmptyState
            action={<Button onClick={() => setShowCreate(true)}>Cadastrar primeiro mercado</Button>}
            description="Cadastre um estabelecimento ou faça isso rapidamente ao iniciar uma compra."
            icon={Building2}
            title="Nenhum mercado cadastrado."
          />
        </section>
      ) : (
        <section className="stores-grid" aria-label="Mercados cadastrados">
          {stores.map((store) => (
            <article className={`store-card ${store.active ? '' : 'is-inactive'}`} key={store.id}>
              <header className="store-card__header">
                <span className="store-card__icon">
                  <Building2 aria-hidden="true" size={22} />
                </span>
                <Badge tone={store.active ? 'success' : 'neutral'}>
                  {store.active ? 'Ativo' : 'Inativo'}
                </Badge>
              </header>
              <div className="store-card__identity">
                <h2>{store.name}</h2>
                {store.nickname && <p>{store.nickname}</p>}
                {store.address && (
                  <span>
                    <MapPin aria-hidden="true" size={14} /> {store.address}
                  </span>
                )}
              </div>
              <div className="store-card__stats">
                <div>
                  <ReceiptText aria-hidden="true" size={16} />
                  <span>
                    <strong>{store.purchaseCount}</strong>{' '}
                    {store.purchaseCount === 1 ? 'compra' : 'compras'}
                  </span>
                </div>
                <div>
                  <WalletCards aria-hidden="true" size={16} />
                  <span>
                    <strong>{formatCurrencyFromCents(store.totalSpentCents)}</strong> no histórico
                  </span>
                </div>
                <div>
                  <CalendarDays aria-hidden="true" size={16} />
                  <span>
                    {store.lastPurchaseAt
                      ? `Última: ${formatDateTime(store.lastPurchaseAt)}`
                      : 'Ainda não utilizado'}
                  </span>
                </div>
              </div>
              {store.notes && <p className="store-card__notes">{store.notes}</p>}
              <footer className="store-card__actions">
                <button
                  aria-label={`Editar ${store.name}`}
                  onClick={() => setEditingStore(store)}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={15} /> Editar
                </button>
                <button
                  aria-label={`${store.active ? 'Desativar' : 'Reativar'} ${store.name}`}
                  onClick={() => void handleSetActive(store)}
                  type="button"
                >
                  {store.active ? (
                    <PowerOff aria-hidden="true" size={15} />
                  ) : (
                    <Power aria-hidden="true" size={15} />
                  )}
                  {store.active ? 'Desativar' : 'Reativar'}
                </button>
                {store.purchaseCount === 0 && (
                  <button
                    aria-label={`Excluir ${store.name}`}
                    className="is-danger"
                    onClick={() => setDeletingStore(store)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} /> Excluir
                  </button>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}

      {showCreate && (
        <StoreFormDialog onClose={() => setShowCreate(false)} onSubmit={handleCreate} />
      )}
      {editingStore && (
        <StoreFormDialog
          onClose={() => setEditingStore(null)}
          onSubmit={handleUpdate}
          store={editingStore}
        />
      )}
      {deletingStore && (
        <DeleteStoreDialog
          onClose={() => setDeletingStore(null)}
          onConfirm={() => removeStore(deletingStore.id)}
          store={deletingStore}
        />
      )}
    </div>
  );
}
