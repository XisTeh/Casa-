import { useMemo, useState } from 'react';
import type { LegacyCatalogMigration } from '../../domain/catalog-sync';
import type { LegacyPurchaseMigration } from '../../domain/purchase-sync';
import type { LegacyShoppingMigration } from '../../domain/shopping-list';
import { Button } from '../../components/Button/Button';

type Props = {
  houseId: string;
  profileId: string;
  shopping: LegacyShoppingMigration | null;
  catalog: LegacyCatalogMigration | null;
  purchases: LegacyPurchaseMigration | null;
  avatarAvailable: boolean;
  importShopping(): Promise<void>;
  importCatalog(): Promise<void>;
  importPurchases(): Promise<void>;
  importAvatar?(): Promise<void>;
};

export function LegacyDataRecoverySection({
  houseId,
  profileId,
  shopping,
  catalog,
  purchases,
  avatarAvailable,
  importShopping,
  importCatalog,
  importPurchases,
  importAvatar,
}: Props) {
  const [hiddenSelection, setHiddenSelection] = useState<{
    key: string;
    fingerprint: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fingerprint = useMemo(
    () =>
      [
        shopping?.count ?? 0,
        catalog?.products ?? 0,
        catalog?.categories ?? 0,
        catalog?.stores ?? 0,
        purchases?.sessions ?? 0,
        purchases?.items ?? 0,
        avatarAvailable ? 1 : 0,
      ].join(':'),
    [avatarAvailable, catalog, purchases, shopping],
  );
  const storageKey = `casae.legacy-recovery-hidden:${profileId}:${houseId}`;
  const hasLegacy = Boolean(shopping || catalog || purchases || avatarAvailable);
  const hiddenFingerprint =
    hiddenSelection?.key === storageKey
      ? hiddenSelection.fingerprint
      : typeof localStorage !== 'undefined'
        ? localStorage.getItem(storageKey)
        : null;
  const hidden = hiddenFingerprint === fingerprint;

  if (!hasLegacy || hidden) return null;

  async function importAll() {
    setImporting(true);
    setError(null);
    try {
      if (shopping) await importShopping();
      if (catalog) await importCatalog();
      if (purchases) await importPurchases();
      if (avatarAvailable && importAvatar) await importAvatar();
      localStorage.removeItem(storageKey);
    } catch {
      setError('Não foi possível adicionar todos os dados. Os registros locais foram preservados.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-labelledby="legacy-data-title" className="settings-card settings-legacy-data">
      <header>
        <div>
          <p className="eyebrow">Recuperação opcional</p>
          <h2 id="legacy-data-title">Dados locais antigos</h2>
        </div>
      </header>
      <p>Existem dados antigos deste dispositivo que ainda não pertencem à Casa atual.</p>
      <ul>
        {shopping && (
          <li>
            {shopping.count} {shopping.count === 1 ? 'item' : 'itens'} da lista
          </li>
        )}
        {catalog?.products ? (
          <li>
            {catalog.products} {catalog.products === 1 ? 'produto' : 'produtos'}
          </li>
        ) : null}
        {catalog?.categories ? (
          <li>
            {catalog.categories} {catalog.categories === 1 ? 'categoria' : 'categorias'}
          </li>
        ) : null}
        {catalog?.stores ? (
          <li>
            {catalog.stores} {catalog.stores === 1 ? 'mercado' : 'mercados'}
          </li>
        ) : null}
        {purchases?.sessions ? (
          <li>
            {purchases.sessions}{' '}
            {purchases.sessions === 1 ? 'compra anterior' : 'compras anteriores'}
          </li>
        ) : null}
        {avatarAvailable && <li>1 foto de perfil local</li>}
      </ul>
      {error && (
        <p className="shopping-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-legacy-data__actions">
        <Button loading={importing} onClick={() => void importAll()} type="button">
          Adicionar à Casa
        </Button>
        <Button
          disabled={importing}
          onClick={() => {
            localStorage.setItem(storageKey, fingerprint);
            setHiddenSelection({ key: storageKey, fingerprint });
          }}
          type="button"
          variant="ghost"
        >
          Ocultar
        </Button>
      </div>
    </section>
  );
}
