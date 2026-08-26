import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';
import { DuplicateProductError } from '../../application/product-service';
import type { Category, NewProduct, Product } from '../../domain/catalog';
import { SHOPPING_UNITS, type ShoppingUnit } from '../../domain/shopping-list';

type Props = {
  product?: Product | null;
  categories: Category[];
  onClose: () => void;
  onSubmit: (input: NewProduct) => Promise<void>;
  onReactivateDuplicate: (id: string) => Promise<void>;
};

export function ProductFormDialog({
  product,
  categories,
  onClose,
  onSubmit,
  onReactivateDuplicate,
}: Props) {
  const activeCategories = categories.filter(
    (category) => category.active || category.id === product?.categoryId,
  );
  const [name, setName] = useState(product?.name ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ?? activeCategories[0]?.id ?? '',
  );
  const [quantity, setQuantity] = useState(product?.defaultQuantity?.toString() ?? '');
  const [unit, setUnit] = useState<ShoppingUnit>(product?.defaultUnit ?? 'unidade');
  const [notes, setNotes] = useState(product?.notes ?? '');
  const [favorite, setFavorite] = useState(product?.favorite ?? false);
  const [isRecurring, setIsRecurring] = useState(product?.isRecurring ?? false);
  const [recurrenceDays, setRecurrenceDays] = useState(product?.recurrenceDays?.toString() ?? '15');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactiveDuplicateId, setInactiveDuplicateId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setInactiveDuplicateId(null);
    try {
      await onSubmit({
        name,
        brand,
        categoryId,
        defaultQuantity: quantity ? Number(quantity) : undefined,
        defaultUnit: unit,
        notes,
        favorite,
        isRecurring,
        recurrenceDays: isRecurring ? Number(recurrenceDays) : undefined,
      });
      onClose();
    } catch (caught) {
      if (caught instanceof DuplicateProductError && !caught.existingProduct.active) {
        setInactiveDuplicateId(caught.existingProduct.id);
      }
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="product-form-title"
        aria-modal="true"
        className="shopping-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">{product ? 'Editar cadastro' : 'Novo cadastro'}</p>
            <h2 id="product-form-title">{product ? 'Editar produto' : 'Adicionar produto'}</h2>
          </div>
          <button
            aria-label="Fechar formulário"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form className="shopping-form" onSubmit={submit}>
          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="product-name">
              Produto <span aria-hidden="true">*</span>
            </label>
            <input
              id="product-name"
              ref={inputRef}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="shopping-form__field">
            <label htmlFor="product-brand">Marca</label>
            <input
              id="product-brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            />
          </div>
          <div className="shopping-form__field">
            <label htmlFor="product-category">
              Categoria <span aria-hidden="true">*</span>
            </label>
            <select
              id="product-category"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="shopping-form__field">
            <label htmlFor="product-quantity">Quantidade padrão</label>
            <input
              id="product-quantity"
              min="0.01"
              step="any"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="shopping-form__field">
            <label htmlFor="product-unit">Unidade</label>
            <select
              id="product-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value as ShoppingUnit)}
            >
              {SHOPPING_UNITS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="product-notes">Observações</label>
            <textarea
              id="product-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <label className="product-favorite-check shopping-form__field shopping-form__field--wide">
            <input
              checked={favorite}
              onChange={(event) => setFavorite(event.target.checked)}
              type="checkbox"
            />
            <span>Marcar como favorito</span>
          </label>
          <fieldset className="product-recurrence-field shopping-form__field shopping-form__field--wide">
            <label className="product-favorite-check">
              <input
                checked={isRecurring}
                onChange={(event) => setIsRecurring(event.target.checked)}
                type="checkbox"
              />
              <span>Marcar como recorrente</span>
            </label>
            {isRecurring && (
              <label htmlFor="product-recurrence-days">
                Repor a cada
                <span className="product-recurrence-input">
                  <input
                    id="product-recurrence-days"
                    inputMode="numeric"
                    max="365"
                    min="1"
                    required
                    type="number"
                    value={recurrenceDays}
                    onChange={(event) => setRecurrenceDays(event.target.value)}
                  />
                  <span>dias</span>
                </span>
              </label>
            )}
            <small>
              O Casaê apenas sugere a reposição. Nada será adicionado à Lista automaticamente.
            </small>
          </fieldset>
          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}
          {inactiveDuplicateId && (
            <Button
              className="product-reactivate-duplicate"
              onClick={async () => {
                setSaving(true);
                await onReactivateDuplicate(inactiveDuplicateId);
                setSaving(false);
                onClose();
              }}
              type="button"
              variant="secondary"
            >
              Reativar produto existente
            </Button>
          )}
          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button loading={saving} type="submit">
              {product ? 'Salvar alterações' : 'Adicionar produto'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
