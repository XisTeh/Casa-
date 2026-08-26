import { Crop, ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { prepareProfilePhotoSource } from '../../application/profile-photo';
import { Button } from '../../components/Button/Button';
import { ProfileAvatar } from '../../components/ProfileAvatar/ProfileAvatar';
import type { HouseMember } from '../../domain/house';
import { DEFAULT_AVATAR_CROP, type ProfileAvatarData } from '../../domain/profile-avatar';
import { PhotoCropDialog } from './PhotoCropDialog';

type CropDraft = {
  sourceBlob: Blob;
  initialCrop: typeof DEFAULT_AVATAR_CROP;
};

export function EditProfileDialog({
  member,
  onClose,
  onSave,
}: {
  member: HouseMember;
  onClose: () => void;
  onSave: (name: string, avatar: ProfileAvatarData | null) => Promise<void>;
}) {
  const [name, setName] = useState(member.displayName);
  const [avatar, setAvatar] = useState<ProfileAvatarData | null>(() =>
    member.avatarBlob
      ? {
          avatarBlob: member.avatarBlob,
          avatarSourceBlob: member.avatarSourceBlob,
          avatarCrop: member.avatarCrop,
        }
      : null,
  );
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropOpenRef = useRef(false);
  const inputId = useId();

  useEffect(() => {
    cropOpenRef.current = Boolean(cropDraft);
  }, [cropDraft]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !cropOpenRef.current) onClose();
    };
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
      setCropDraft({
        sourceBlob: await prepareProfilePhotoSource(file),
        initialCrop: DEFAULT_AVATAR_CROP,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível preparar a foto.');
    } finally {
      setProcessing(false);
      event.target.value = '';
    }
  }

  function repositionPhoto() {
    if (!avatar) return;
    setError(null);
    setCropDraft({
      sourceBlob: avatar.avatarSourceBlob ?? avatar.avatarBlob,
      initialCrop:
        avatar.avatarSourceBlob && avatar.avatarCrop ? avatar.avatarCrop : DEFAULT_AVATAR_CROP,
    });
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
      await onSave(name, avatar);
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
                avatarBlob: avatar?.avatarBlob,
              }}
              size="profile"
            />
            <div className="settings-photo-field__actions">
              <span>Foto de perfil</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-label="Selecionar foto de perfil"
                className="sr-only"
                id={inputId}
                onChange={(event) => void choosePhoto(event)}
                ref={fileRef}
                type="file"
              />
              <div className="settings-photo-field__buttons">
                <Button
                  aria-controls={inputId}
                  disabled={processing}
                  onClick={() => fileRef.current?.click()}
                  type="button"
                  variant="secondary"
                >
                  <ImagePlus aria-hidden="true" size={17} />
                  {processing ? 'Preparando foto…' : avatar ? 'Trocar foto' : 'Escolher foto'}
                </Button>
                {avatar && (
                  <>
                    <Button onClick={repositionPhoto} type="button" variant="secondary">
                      <Crop aria-hidden="true" size={17} /> Reposicionar
                    </Button>
                    <Button
                      aria-label="Remover foto de perfil"
                      onClick={() => {
                        setAvatar(null);
                        setError(null);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" size={17} /> Remover foto
                    </Button>
                  </>
                )}
              </div>
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
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={processing} loading={saving} type="submit">
              Salvar alterações
            </Button>
          </footer>
        </form>
      </section>
      {cropDraft && (
        <PhotoCropDialog
          initialCrop={cropDraft.initialCrop}
          onCancel={() => setCropDraft(null)}
          onUse={(nextAvatar) => {
            setAvatar(nextAvatar);
            setCropDraft(null);
          }}
          sourceBlob={cropDraft.sourceBlob}
        />
      )}
    </div>
  );
}
