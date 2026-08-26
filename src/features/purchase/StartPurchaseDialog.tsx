import { Plus, Store as StoreIcon, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';
import type { PurchaseEntryMode } from '../../domain/purchase';
import type { NewStore, Store } from '../../domain/store';

type StartPurchaseDialogProps = {
  stores: Store[];
  onClose: () => void;
  onCreateStore: (input: NewStore) => Promise<Store>;
  onSubmit: (store: Pick<Store, 'id' | 'name'>) => Promise<void>;
  mode: PurchaseEntryMode;
};

const emptyStore: NewStore = { name: '', nickname: '', address: '', notes: '' };

export function StartPurchaseDialog({
  stores,
  onClose,
  onCreateStore,
  onSubmit,
  mode,
}: StartPurchaseDialogProps) {
  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id ?? 'new');
  const [newStore, setNewStore] = useState(emptyStore);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newStoreInputRef = useRef<HTMLInputElement>(null);
  const isCreating = selectedStoreId === 'new';

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (isCreating) newStoreInputRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      previouslyFocused?.focus();
    };
  }, [isCreating, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsStarting(true);
    setError(null);
    try {
      let store = stores.find((candidate) => candidate.id === selectedStoreId);
      if (isCreating) store = await onCreateStore(newStore);
      if (!store) throw new Error('Selecione um mercado para continuar.');
      await onSubmit(store);
      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível iniciar.');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="start-purchase-title"
        aria-modal="true"
        className="shopping-dialog purchase-start-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">
              {mode === 'quick' ? 'Compra rápida' : 'Comprar usando a lista'}
            </p>
            <h2 id="start-purchase-title">Onde você está comprando?</h2>
          </div>
          <button
            aria-label="Fechar"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form className="purchase-start-form" onSubmit={handleSubmit}>
          {stores.length > 0 && (
            <fieldset className="purchase-store-picker">
              <legend>Mercado cadastrado</legend>
              {stores.map((store) => (
                <label key={store.id}>
                  <input
                    checked={selectedStoreId === store.id}
                    name="purchase-store"
                    onChange={() => setSelectedStoreId(store.id)}
                    type="radio"
                    value={store.id}
                  />
                  <span>
                    <StoreIcon aria-hidden="true" size={17} />
                    <strong>{store.name}</strong>
                    {store.nickname ? <small>{store.nickname}</small> : null}
                  </span>
                </label>
              ))}
              <label>
                <input
                  checked={isCreating}
                  name="purchase-store"
                  onChange={() => setSelectedStoreId('new')}
                  type="radio"
                  value="new"
                />
                <span>
                  <Plus aria-hidden="true" size={17} />
                  <strong>Cadastrar novo</strong>
                </span>
              </label>
            </fieldset>
          )}
          {isCreating && (
            <div className="purchase-quick-store">
              <label htmlFor="purchase-store-name">Nome do novo mercado</label>
              <div className="purchase-store-input">
                <StoreIcon aria-hidden="true" size={18} />
                <input
                  autoComplete="off"
                  id="purchase-store-name"
                  onChange={(event) => setNewStore({ ...newStore, name: event.target.value })}
                  placeholder="Ex.: Mercado do bairro"
                  ref={newStoreInputRef}
                  required
                  value={newStore.name}
                />
              </div>
              <p>O mercado será salvo e ficará disponível nas próximas compras.</p>
            </div>
          )}
          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}
          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="secondary">
              Voltar
            </Button>
            <Button loading={isStarting} type="submit">
              {mode === 'quick' ? 'Começar compra rápida' : 'Comprar usando a lista'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
