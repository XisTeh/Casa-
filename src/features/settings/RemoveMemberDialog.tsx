import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { HouseMember } from '../../domain/house';
import { Button } from '../../components/Button/Button';

export function RemoveMemberDialog({
  member,
  onClose,
  onConfirm,
}: {
  member: HouseMember;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
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
  async function confirm() {
    setSaving(true);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível remover.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="remove-member-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Membros</p>
            <h2 id="remove-member-title">Remover {member.displayName}?</h2>
          </div>
          <button
            aria-label="Fechar remoção"
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <p>
          O perfil local será removido desta Casa. Compras anteriores continuarão preservando o nome
          histórico.
        </p>
        {error && (
          <p className="shopping-form__error" role="alert">
            {error}
          </p>
        )}
        <footer className="shopping-dialog__footer">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button loading={saving} onClick={() => void confirm()} type="button">
            Remover membro
          </Button>
        </footer>
      </section>
    </div>
  );
}
