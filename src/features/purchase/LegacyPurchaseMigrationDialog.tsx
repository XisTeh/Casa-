import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import type { LegacyPurchaseMigration } from '../../domain/purchase-sync';

export function LegacyPurchaseMigrationDialog({
  migration,
  houseName,
  onClose,
  onImport,
}: {
  migration: LegacyPurchaseMigration;
  houseName: string;
  onClose(): void;
  onImport(): Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shopping-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="legacy-purchases-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Dados deste dispositivo</p>
            <h2 id="legacy-purchases-title">Adicionar compras anteriores?</h2>
          </div>
        </header>
        <div className="invite-dialog__content">
          <p>
            Encontramos compras anteriores neste dispositivo. Deseja adicioná-las à Casa {houseName}
            ?
          </p>
          <small>
            {migration.sessions} compras · {migration.items} itens. Nada será enviado ou apagado sem
            sua confirmação.
          </small>
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
                  'Não foi possível adicionar as compras. Os dados locais foram preservados.',
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
