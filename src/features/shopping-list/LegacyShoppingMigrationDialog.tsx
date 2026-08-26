import { useState } from 'react';
import { Button } from '../../components/Button/Button';

export function LegacyShoppingMigrationDialog({
  count,
  houseName,
  onClose,
  onImport,
}: {
  count: number;
  houseName: string;
  onClose(): void;
  onImport(): Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shopping-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="legacy-shopping-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Dados deste dispositivo</p>
            <h2 id="legacy-shopping-title">Adicionar itens locais?</h2>
          </div>
        </header>
        <div className="invite-dialog__content">
          <p>
            Encontramos {count} {count === 1 ? 'item' : 'itens'} da Lista ainda sem Casa online.
            Deseja adicioná-los à Casa {houseName}?
          </p>
          <small>Nada será enviado ou apagado sem sua confirmação.</small>
          {error && <p role="alert">{error}</p>}
        </div>
        <footer className="shopping-dialog__footer">
          <Button disabled={loading} onClick={onClose} type="button" variant="secondary">
            Agora não
          </Button>
          <Button
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await onImport();
              } catch {
                setError(
                  'Não foi possível adicionar os itens. Seus dados locais foram preservados.',
                );
                setLoading(false);
              }
            }}
            type="button"
          >
            Adicionar à Casa
          </Button>
        </footer>
      </section>
    </div>
  );
}
