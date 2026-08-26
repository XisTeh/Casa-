import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';
import type { Category } from '../../domain/catalog';
import {
  SHOPPING_PRIORITIES,
  SHOPPING_UNITS,
  shoppingPriorityLabels,
  type NewShoppingListItem,
  type ShoppingListItem,
  type ShoppingPriority,
} from '../../domain/shopping-list';

type FormValues = NewShoppingListItem;

type ShoppingListFormDialogProps = {
  item?: ShoppingListItem | null;
  onClose: () => void;
  onSubmit: (input: NewShoppingListItem) => Promise<void>;
  categories: Category[];
};

function getInitialValues(
  item: ShoppingListItem | null | undefined,
  categories: Category[],
): FormValues {
  const defaultCategory =
    categories.find((category) => category.legacyKey === 'mercearia') ?? categories[0];
  return {
    productName: item?.productName ?? '',
    quantity: item?.quantity ?? 1,
    unit: item?.unit ?? 'unidade',
    category: item?.category ?? 'mercearia',
    categoryId: item?.categoryId ?? defaultCategory?.id,
    categoryName: item?.categoryName ?? defaultCategory?.name,
    preferredBrand: item?.preferredBrand ?? '',
    notes: item?.notes ?? '',
    priority: item?.priority ?? 'normal',
  };
}

export function ShoppingListFormDialog({
  item,
  categories,
  onClose,
  onSubmit,
}: ShoppingListFormDialogProps) {
  const activeCategories = categories.filter(
    (category) => category.active || category.id === item?.categoryId,
  );
  const [values, setValues] = useState(() => getInitialValues(item, categories));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(item);

  useEffect(() => {
    productInput.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function updateValues<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await onSubmit(values);
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Não foi possível salvar o produto.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="shopping-form-title"
        aria-modal="true"
        className="shopping-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">{isEditing ? 'Ajustar item' : 'Novo item'}</p>
            <h2 id="shopping-form-title">{isEditing ? 'Editar produto' : 'Adicionar produto'}</h2>
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

        <form className="shopping-form" onSubmit={handleSubmit}>
          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="shopping-product-name">
              Produto <span aria-hidden="true">*</span>
            </label>
            <input
              id="shopping-product-name"
              onChange={(event) => updateValues('productName', event.target.value)}
              ref={productInput}
              required
              value={values.productName}
            />
          </div>

          <div className="shopping-form__field">
            <label htmlFor="shopping-quantity">
              Quantidade <span aria-hidden="true">*</span>
            </label>
            <input
              id="shopping-quantity"
              min="0.01"
              onChange={(event) => updateValues('quantity', Number(event.target.value))}
              required
              step="any"
              type="number"
              value={values.quantity}
            />
          </div>

          <div className="shopping-form__field">
            <label htmlFor="shopping-unit">
              Unidade <span aria-hidden="true">*</span>
            </label>
            <select
              id="shopping-unit"
              onChange={(event) => updateValues('unit', event.target.value as FormValues['unit'])}
              required
              value={values.unit}
            >
              {SHOPPING_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="shopping-category">
              Categoria <span aria-hidden="true">*</span>
            </label>
            <select
              id="shopping-category"
              onChange={(event) => {
                const category = categories.find(
                  (candidate) => candidate.id === event.target.value,
                );
                if (!category) return;
                setValues((current) => ({
                  ...current,
                  categoryId: category.id,
                  categoryName: category.name,
                  category: category.legacyKey ?? 'outros',
                }));
              }}
              required
              value={values.categoryId}
            >
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="shopping-brand">Marca preferida</label>
            <input
              id="shopping-brand"
              onChange={(event) => updateValues('preferredBrand', event.target.value)}
              value={values.preferredBrand}
            />
          </div>

          <div className="shopping-form__field shopping-form__field--wide">
            <label htmlFor="shopping-notes">Observações</label>
            <textarea
              id="shopping-notes"
              onChange={(event) => updateValues('notes', event.target.value)}
              rows={3}
              value={values.notes}
            />
          </div>

          <fieldset className="shopping-form__field shopping-form__field--wide">
            <legend>Prioridade</legend>
            <div className="shopping-priority-options">
              {SHOPPING_PRIORITIES.map((priority) => (
                <label className="shopping-priority-option" key={priority}>
                  <input
                    checked={values.priority === priority}
                    name="shopping-priority"
                    onChange={() => updateValues('priority', priority as ShoppingPriority)}
                    type="radio"
                  />
                  <span>{shoppingPriorityLabels[priority]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}

          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button loading={isSaving} type="submit">
              {isEditing ? 'Salvar alterações' : 'Adicionar à lista'}
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
