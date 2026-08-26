import { X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { HouseMember, HouseMemberRole } from '../../domain/house';
import { Button } from '../../components/Button/Button';

type DialogMode = 'edit-house' | 'create-house' | 'member';

export function HouseholdFormDialog({
  mode,
  initialName = '',
  member,
  canChangeRole = true,
  canChangeName = true,
  onClose,
  onSave,
}: {
  mode: DialogMode;
  initialName?: string;
  member?: HouseMember;
  canChangeRole?: boolean;
  canChangeName?: boolean;
  onClose: () => void;
  onSave: (name: string, role: HouseMemberRole) => Promise<void>;
}) {
  const [name, setName] = useState(member?.displayName ?? initialName);
  const [role, setRole] = useState<HouseMemberRole>(member?.role ?? 'member');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const title =
    mode === 'edit-house'
      ? 'Editar Casa'
      : mode === 'create-house'
        ? 'Nova Casa'
        : member
          ? 'Editar membro'
          : 'Adicionar membro';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(mode === 'member' ? 'Informe o nome do membro.' : 'Informe o nome da Casa.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(name, role);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="household-dialog-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Configurações locais</p>
            <h2 id="household-dialog-title">{title}</h2>
          </div>
          <button
            aria-label={`Fechar ${title}`}
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="settings-field">
            <span>{mode === 'member' ? 'Nome do membro' : 'Nome da Casa'}</span>
            <input
              disabled={!canChangeName}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          {mode === 'member' && (
            <label className="settings-field">
              <span>Função</span>
              <select
                disabled={!canChangeRole}
                onChange={(event) => setRole(event.target.value as HouseMemberRole)}
                value={role}
              >
                <option value="owner">Proprietário</option>
                <option value="member">Membro</option>
              </select>
            </label>
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
            <Button loading={saving} type="submit">
              Salvar
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
