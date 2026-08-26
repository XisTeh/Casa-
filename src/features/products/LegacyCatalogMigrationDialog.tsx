import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import type { LegacyCatalogMigration } from '../../domain/catalog-sync';

export function LegacyCatalogMigrationDialog({
  migration,
  houseName,
  onClose,
  onImport,
}: {
  migration: LegacyCatalogMigration;
  houseName: string;
  onClose(): void;
  onImport(): Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shopping-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="legacy-catalog-title"
        aria-modal="true"
        className="shopping-dialog settings-dialog"
        role="dialog"
      >
        <header className="shopping-dialog__header">
          <div>
            <p className="eyebrow">Dados deste dispositivo</p>
            <h2 id="legacy-catalog-title">Adicionar dados locais?</h2>
          </div>
        </header>
        <div className="invite-dialog__content">
          <p>
            Encontramos produtos, categorias e mercados deste dispositivo. Deseja adicioná-los à
            Casa {houseName}?
          </p>
          <small>
            {migration.categories} categorias · {migration.products} produtos · {migration.stores}{' '}
            mercados. Nada será enviado ou apagado sem sua confirmação.
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
                  'Não foi possível adicionar os dados. Os registros locais foram preservados.',
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
