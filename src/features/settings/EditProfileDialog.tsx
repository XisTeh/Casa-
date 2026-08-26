import { ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { optimizeProfilePhoto } from '../../application/profile-photo';
import { Button } from '../../components/Button/Button';
import { ProfileAvatar } from '../../components/ProfileAvatar/ProfileAvatar';
import type { HouseMember } from '../../domain/house';

export function EditProfileDialog({
  member,
  onClose,
  onSave,
}: {
  member: HouseMember;
  onClose: () => void;
  onSave: (name: string, avatarBlob: Blob | null) => Promise<void>;
}) {
  const [name, setName] = useState(member.displayName);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(member.avatarBlob ?? null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      previous?.focus();
    };
  }, [onClose]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      setAvatarBlob(await optimizeProfilePhoto(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível preparar a foto.');
    } finally {
      setProcessing(false);
      event.target.value = '';
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome do membro.');
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(name, avatarBlob);
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
        aria-labelledby="edit-profile-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog settings-profile-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Identidade local</p>
            <h2 id="edit-profile-title">Editar perfil</h2>
          </div>
          <button
            aria-label="Fechar Editar perfil"
            className="shopping-dialog__close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="settings-photo-field">
            <ProfileAvatar
              profile={{
                displayName: name || member.displayName,
                avatarBlob: avatarBlob ?? undefined,
              }}
              size="profile"
            />
            <div className="settings-photo-field__actions">
              <span>Foto de perfil</span>
              <input
                accept="image/*"
                aria-label="Selecionar foto de perfil"
                className="sr-only"
                id={inputId}
                onChange={(event) => void choosePhoto(event)}
                ref={fileRef}
                type="file"
              />
              <Button
                aria-controls={inputId}
                disabled={processing}
                onClick={() => fileRef.current?.click()}
                type="button"
                variant="secondary"
              >
                <ImagePlus aria-hidden="true" size={17} />
                {processing ? 'Otimizando foto…' : avatarBlob ? 'Trocar foto' : 'Escolher foto'}
              </Button>
              {avatarBlob && (
                <Button
                  aria-label="Remover foto de perfil"
                  onClick={() => {
                    setAvatarBlob(null);
                    setError(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={17} /> Remover foto
                </Button>
              )}
            </div>
          </div>
          <label className="settings-field">
            <span>Nome</span>
            <input
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              ref={nameRef}
              value={name}
            />
          </label>
          {error && (
            <p className="shopping-form__error" role="alert">
              {error}
            </p>
          )}
          <footer className="shopping-dialog__footer">
            <Button onClick={onClose} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button disabled={processing} loading={saving} type="submit">
              Salvar alterações
            </Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
