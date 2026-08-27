import { Calculator, Check, Pencil, Plus, Search, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  findKnownProductSuggestions,
  findUnambiguousExactProduct,
  type KnownProduct,
} from '../../application/known-product-selectors';
import {
  calculateItemTotalCents,
  formatCurrencyFromCents,
  formatQuantity,
  parseBrazilianCurrencyToCents,
  parseBrazilianDecimal,
} from '../../application/locale-formatters';
import { Button } from '../../components/Button/Button';
import type { ManualPurchaseItemInput, PurchaseItem } from '../../domain/purchase';
import {
  SHOPPING_UNITS,
  type ShoppingCategory,
  type ShoppingUnit,
} from '../../domain/shopping-list';

type QuickPurchaseItemFormProps = {
  editingItem: PurchaseItem | null;
  knownProducts: KnownProduct[];
  onCancelEdit: () => void;
  onCreate: (input: ManualPurchaseItemInput) => Promise<void>;
  onUpdate: (itemId: string, input: ManualPurchaseItemInput) => Promise<void>;
};

type ProductMetadata = {
  productId?: string;
  brand: string;
  category: ShoppingCategory;
  categoryName?: string;
};

const emptyMetadata: ProductMetadata = { brand: '', category: 'outros' };

export function QuickPurchaseItemForm({
  editingItem,
  knownProducts,
  onCancelEdit,
  onCreate,
  onUpdate,
}: QuickPurchaseItemFormProps) {
  const [productName, setProductName] = useState(editingItem?.productNameSnapshot ?? '');
  const [quantity, setQuantity] = useState(
    editingItem ? formatQuantity(editingItem.purchasedQuantity) : '1',
  );
  const [unit, setUnit] = useState<ShoppingUnit>(editingItem?.unitSnapshot ?? 'unidade');
  const [unitPrice, setUnitPrice] = useState(
    editingItem ? (editingItem.unitPriceCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [metadata, setMetadata] = useState<ProductMetadata>(
    editingItem
      ? {
          productId: editingItem.productId,
          brand: editingItem.brandSnapshot,
          category: editingItem.categorySnapshot,
          categoryName: editingItem.categoryNameSnapshot,
        }
      : emptyMetadata,
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmedProductIdentity, setConfirmedProductIdentity] = useState<string | null>(
    editingItem?.productId ?? null,
  );
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autocompleteRootRef = useRef<HTMLDivElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productInputId = useId();
  const suggestionsId = useId();
  const parsedQuantity = parseBrazilianDecimal(quantity);
  const unitPriceCents = parseBrazilianCurrencyToCents(unitPrice);
  const totalPriceCents =
    parsedQuantity !== null && unitPriceCents !== null
      ? calculateItemTotalCents(parsedQuantity, unitPriceCents)
      : 0;
  const suggestions = useMemo(
    () => findKnownProductSuggestions(knownProducts, productName),
    [knownProducts, productName],
  );

  useEffect(() => {
    requestAnimationFrame(() => productInputRef.current?.focus());
  }, []);

  useEffect(() => {
    const happenedOutsideAutocomplete = (event: Event) => {
      const autocomplete = autocompleteRootRef.current;
      if (!autocomplete) return false;
      const interactionPath = event.composedPath();
      const happenedInside = interactionPath.length
        ? interactionPath.includes(autocomplete)
        : autocomplete.contains(event.target as Node);
      return !happenedInside;
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!happenedOutsideAutocomplete(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      const activatesControl = target?.closest(
        'input, select, textarea, button, a[href], label, [role="button"], [tabindex]',
      );
      if (!activatesControl) setShowSuggestions(false);
    };
    const closeOnOutsideActivation = (event: MouseEvent) => {
      if (happenedOutsideAutocomplete(event)) setShowSuggestions(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('click', closeOnOutsideActivation);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('click', closeOnOutsideActivation);
    };
  }, []);

  function resetForm() {
    setProductName('');
    setQuantity('1');
    setUnit('unidade');
    setUnitPrice('');
    setMetadata(emptyMetadata);
    setConfirmedProductIdentity(null);
    setHighlightedSuggestion(0);
    setShowSuggestions(false);
    setError(null);
  }

  function selectProduct(product: KnownProduct) {
    setProductName(product.name);
    setUnit(product.unit);
    if (product.defaultQuantity !== undefined) {
      setQuantity(formatQuantity(product.defaultQuantity));
    }
    setMetadata({
      productId: product.productId,
      brand: product.brand,
      category: product.category,
      categoryName: product.categoryName,
    });
    setConfirmedProductIdentity(product.identity);
    setHighlightedSuggestion(0);
    setShowSuggestions(false);
  }

  function handleProductKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setShowSuggestions(true);
      setHighlightedSuggestion((current) => {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        return (current + direction + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (event.key === 'Enter' && showSuggestions) {
      event.preventDefault();
      selectProduct(suggestions[highlightedSuggestion] ?? suggestions[0]!);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowSuggestions(false);
    if (!productName.trim()) return setError('Informe o nome do produto.');
    if (parsedQuantity === null || parsedQuantity <= 0) {
      return setError('Informe uma quantidade válida.');
    }
    if (unitPriceCents === null) return setError('Informe o preço unitário.');

    const exactProduct = metadata.productId
      ? undefined
      : findUnambiguousExactProduct(knownProducts, productName);
    const resolvedMetadata = exactProduct
      ? {
          productId: exactProduct.productId,
          brand: exactProduct.brand,
          category: exactProduct.category,
          categoryName: exactProduct.categoryName,
        }
      : metadata;
    const input: ManualPurchaseItemInput = {
      productName,
      productId: resolvedMetadata.productId,
      brand: resolvedMetadata.brand,
      category: resolvedMetadata.category,
      categoryName: resolvedMetadata.categoryName,
      quantity: parsedQuantity,
      unit,
      unitPriceCents,
    };

    setIsSaving(true);
    setError(null);
    try {
      if (editingItem) await onUpdate(editingItem.id, input);
      else await onCreate(input);
      resetForm();
      onCancelEdit();
      requestAnimationFrame(() => productInputRef.current?.focus());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Não foi possível salvar.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="quick-purchase-form" onSubmit={handleSubmit}>
      <header className="quick-purchase-form__header">
        <span>
          {editingItem ? (
            <Pencil aria-hidden="true" size={19} />
          ) : (
            <Plus aria-hidden="true" size={20} />
          )}
        </span>
        <div>
          <h2>{editingItem ? 'Editar item' : 'Adicionar item'}</h2>
          <p>Registre e continue pelo mercado sem sair desta tela.</p>
        </div>
        {editingItem && (
          <button aria-label="Cancelar edição" onClick={onCancelEdit} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        )}
      </header>

      <div className="quick-purchase-form__fields">
        <div className="quick-purchase-product" ref={autocompleteRootRef}>
          <label htmlFor={productInputId}>Produto</label>
          <div className="quick-purchase-input">
            <Search aria-hidden="true" size={17} />
            <input
              aria-activedescendant={
                showSuggestions && suggestions.length
                  ? `${suggestionsId}-option-${highlightedSuggestion}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls={suggestionsId}
              aria-expanded={showSuggestions && suggestions.length > 0}
              autoFocus
              autoComplete="off"
              id={productInputId}
              onChange={(event) => {
                const nextName = event.target.value;
                setProductName(nextName);
                setMetadata(emptyMetadata);
                setConfirmedProductIdentity(null);
                setHighlightedSuggestion(0);
                setShowSuggestions(findKnownProductSuggestions(knownProducts, nextName).length > 0);
              }}
              onFocus={() => {
                if (!confirmedProductIdentity && suggestions.length > 0) {
                  setHighlightedSuggestion(0);
                  setShowSuggestions(true);
                }
              }}
              onKeyDown={handleProductKeyDown}
              placeholder="Ex.: Coca-Cola 2L"
              ref={productInputRef}
              role="combobox"
              value={productName}
            />
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div
              aria-label="Sugestões de produtos"
              className="quick-product-suggestions"
              id={suggestionsId}
              role="listbox"
            >
              {suggestions.map((product, index) => (
                <button
                  aria-selected={index === highlightedSuggestion}
                  id={`${suggestionsId}-option-${index}`}
                  key={product.identity}
                  onClick={() => selectProduct(product)}
                  onFocus={() => setHighlightedSuggestion(index)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    selectProduct(product);
                  }}
                  role="option"
                  type="button"
                >
                  <span>
                    <strong>{product.name}</strong>
                    {product.brand && <small>{product.brand}</small>}
                  </span>
                  {product.lastPriceCents !== undefined && (
                    <small>
                      Referência: {formatCurrencyFromCents(product.lastPriceCents)}
                      {product.lastStoreName ? ` · ${product.lastStoreName}` : ''}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <label>
          <span>Quantidade</span>
          <div className="quick-purchase-input">
            <input
              aria-label="Quantidade do item rápido"
              inputMode="decimal"
              onChange={(event) => setQuantity(event.target.value)}
              onFocus={() => setShowSuggestions(false)}
              value={quantity}
            />
          </div>
        </label>

        <label>
          <span>Unidade</span>
          <select
            aria-label="Unidade do item rápido"
            onChange={(event) => setUnit(event.target.value as ShoppingUnit)}
            onFocus={() => setShowSuggestions(false)}
            value={unit}
          >
            {SHOPPING_UNITS.map((option) => (
              <option key={option} value={option}>
                {option === 'unidade' ? 'un' : option}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Preço unitário</span>
          <div className="quick-purchase-input quick-purchase-price">
            <span>R$</span>
            <input
              aria-label="Preço unitário do item rápido"
              inputMode="decimal"
              onChange={(event) => setUnitPrice(event.target.value)}
              onFocus={() => setShowSuggestions(false)}
              placeholder="0,00"
              value={unitPrice}
            />
          </div>
        </label>
      </div>

      <div className="quick-purchase-form__result" aria-live="polite">
        <Calculator aria-hidden="true" size={18} />
        <span>
          {parsedQuantity && unitPriceCents !== null
            ? `${formatQuantity(parsedQuantity)} × ${formatCurrencyFromCents(unitPriceCents)}`
            : 'Total do item'}
        </span>
        <strong>{formatCurrencyFromCents(totalPriceCents)}</strong>
      </div>

      {error && (
        <p className="shopping-form__error" role="alert">
          {error}
        </p>
      )}
      <Button
        className="quick-purchase-form__submit"
        icon={<Check aria-hidden="true" size={19} />}
        loading={isSaving}
        type="submit"
      >
        {editingItem ? 'Salvar alterações' : 'Adicionar e continuar'}
      </Button>
    </form>
  );
}
