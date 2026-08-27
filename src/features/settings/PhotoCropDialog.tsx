import { Move, X, ZoomIn } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useBlobImageSource } from '../../application/use-blob-image-source';
import {
  constrainAvatarCrop,
  createProfileAvatar,
  getAvatarPreviewGeometry,
  MAX_AVATAR_ZOOM,
  moveAvatarCrop,
} from '../../application/profile-photo';
import { Button } from '../../components/Button/Button';
import { DEFAULT_AVATAR_CROP, type AvatarCrop } from '../../domain/profile-avatar';

type ImageSize = { width: number; height: number };

export function PhotoCropDialog({
  sourceBlob,
  initialCrop = DEFAULT_AVATAR_CROP,
  onCancel,
  onUse,
}: {
  sourceBlob: Blob;
  initialCrop?: AvatarCrop;
  onCancel: () => void;
  onUse: (avatar: Awaited<ReturnType<typeof createProfileAvatar>>) => void;
}) {
  const [crop, setCrop] = useState(initialCrop);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [viewportSize, setViewportSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const imageRef = useBlobImageSource(sourceBlob);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setViewportSize(stage.clientWidth);
    updateSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(stage);
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onCancel]);

  const geometry =
    imageSize && viewportSize ? getAvatarPreviewGeometry(imageSize, viewportSize, crop) : null;

  function move(deltaX: number, deltaY: number) {
    if (!imageSize || !viewportSize) return;
    setCrop((current) => moveAvatarCrop(current, imageSize, viewportSize, deltaX, deltaY));
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    move(event.clientX - drag.x, event.clientY - drag.y);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    const distance = event.shiftKey ? 20 : 8;
    const deltas: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    move(...delta);
  }

  async function confirmPhoto() {
    setSaving(true);
    setError(null);
    try {
      onUse(await createProfileAvatar(sourceBlob, crop));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível ajustar a foto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="shopping-dialog-backdrop photo-crop-backdrop"
      onMouseDown={(event) => event.stopPropagation()}
      role="presentation"
    >
      <section
        aria-labelledby="photo-crop-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog photo-crop-dialog"
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Foto de perfil</p>
            <h2 id="photo-crop-title">Ajustar foto</h2>
          </div>
          <button
            aria-label="Fechar ajuste da foto"
            className="shopping-dialog__close"
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <p className="photo-crop-dialog__hint">
          <Move aria-hidden="true" size={17} /> Arraste para reposicionar
        </p>
        <div
          aria-label="Área de recorte da foto. Use as setas para reposicionar."
          className="photo-crop-dialog__stage"
          onKeyDown={moveWithKeyboard}
          onPointerCancel={stopDrag}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          ref={stageRef}
          role="application"
          tabIndex={0}
        >
          <img
            alt="Prévia da foto para recorte"
            draggable={false}
            onError={() =>
              setError('Não foi possível carregar a foto para edição. Tente novamente.')
            }
            onLoad={(event) => {
              const next = {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              };
              setImageSize(next);
              setCrop((current) => constrainAvatarCrop(current, next));
            }}
            ref={imageRef}
            style={
              geometry
                ? {
                    height: `${geometry.height}px`,
                    left: `${geometry.left}px`,
                    top: `${geometry.top}px`,
                    width: `${geometry.width}px`,
                  }
                : undefined
            }
          />
          <div aria-hidden="true" className="photo-crop-dialog__mask" />
        </div>

        <label className="photo-crop-dialog__zoom">
          <span>
            <ZoomIn aria-hidden="true" size={17} /> Zoom da foto
          </span>
          <input
            aria-label="Zoom da foto"
            disabled={!imageSize}
            max={MAX_AVATAR_ZOOM}
            min="1"
            onChange={(event) => {
              if (!imageSize) return;
              setCrop((current) =>
                constrainAvatarCrop({ ...current, zoom: Number(event.target.value) }, imageSize),
              );
            }}
            step="0.01"
            type="range"
            value={crop.zoom}
          />
        </label>

        {error && (
          <p className="shopping-form__error" role="alert">
            {error}
          </p>
        )}
        <footer className="shopping-dialog__footer">
          <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">
            Cancelar
          </Button>
          <Button
            disabled={!imageSize}
            loading={saving}
            onClick={() => void confirmPhoto()}
            type="button"
          >
            Usar foto
          </Button>
        </footer>
      </section>
    </div>
  );
}
