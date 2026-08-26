import { Check, Copy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { HouseInviteReceipt } from '../../domain/online-house';
import { Button } from '../../components/Button/Button';

export function HouseInviteDialog({
  invite,
  houseName,
  onClose,
}: {
  invite: HouseInviteReceipt;
  houseName: string;
  onClose(): void;
}) {
  const [copied, setCopied] = useState(false);
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
  async function copy() {
    await navigator.clipboard.writeText(invite.token);
    setCopied(true);
  }
  return (
    <div className="shopping-dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="invite-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Convite seguro</p>
            <h2 id="invite-title">Convidar para {houseName}</h2>
          </div>
          <button
            aria-label="Fechar convite"
            className="shopping-dialog__close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="invite-dialog__content">
          <p>
            Envie este código somente para a pessoa que deseja adicionar. Ele pode ser usado uma vez
            e expira em 7 dias.
          </p>
          <code>{invite.token}</code>
          <Button onClick={() => void copy()} variant="secondary">
            {copied ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <Copy aria-hidden="true" size={17} />
            )}
            {copied ? 'Código copiado' : 'Copiar código'}
          </Button>
          <small>
            Expira em{' '}
            {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
              new Date(invite.expiresAt),
            )}
            .
          </small>
        </div>
      </section>
    </div>
  );
}
