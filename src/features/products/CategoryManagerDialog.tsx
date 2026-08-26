import { Pencil, Power, PowerOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button/Button';
import type { Category } from '../../domain/catalog';

type Props = {
  categories: Category[];
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
};

export function CategoryManagerDialog({
  categories,
  onClose,
  onCreate,
  onRename,
  onSetActive,
}: Props) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function run(operation: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await onCreate(name);
      setName('');
      inputRef.current?.focus();
    });
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="category-manager-title"
        aria-modal="true"
        className="shopping-dialog category-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Organização</p>
            <h2 id="category-manager-title">Gerenciar categorias</h2>
          </div>
          <button
            aria-label="Fechar categorias"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form className="category-create" onSubmit={create}>
          <label htmlFor="new-category">Nova categoria</label>
          <div>
            <input
              id="new-category"
              ref={inputRef}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button disabled={saving} type="submit">
              Criar
            </Button>
          </div>
        </form>
        <div className="category-list">
          {categories.map((category) => (
            <div className="category-row" key={category.id}>
              {editingId === category.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      await onRename(category.id, editingName);
                      setEditingId(null);
                    });
                  }}
                >
                  <label className="sr-only" htmlFor={`category-${category.id}`}>
                    Nome da categoria
                  </label>
                  <input
                    id={`category-${category.id}`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                  />
                  <Button disabled={saving} type="submit" variant="secondary">
                    Salvar
                  </Button>
                </form>
              ) : (
                <div>
                  <strong>{category.name}</strong>
                  <small>{category.active ? 'Ativa' : 'Inativa'}</small>
                </div>
              )}
              {editingId !== category.id && (
                <div className="category-row__actions">
                  <button
                    aria-label={`Editar ${category.name}`}
                    onClick={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                    }}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                  <button
                    aria-label={`${category.active ? 'Desativar' : 'Reativar'} ${category.name}`}
                    onClick={() => void run(() => onSetActive(category.id, !category.active))}
                    type="button"
                  >
                    {category.active ? (
                      <PowerOff aria-hidden="true" size={16} />
                    ) : (
                      <Power aria-hidden="true" size={16} />
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {error && (
          <p className="shopping-form__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
