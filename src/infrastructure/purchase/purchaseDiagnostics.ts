import type { PurchaseSyncOutboxEntry } from '../../domain/purchase-sync';
import { purchaseSessionFingerprint } from '../../domain/purchase-fingerprint';
import {
  ACTIVE_HOUSE_METADATA_KEY,
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
  type LocalMetadata,
} from '../local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from './LocalPurchaseRepository';

async function activeHouseId(database: CasaeLocalDatabase) {
  const native = await database.getNativeDatabase();
  if (!native) {
    const value = database.getMemoryDatabase().metadata.get(ACTIVE_HOUSE_METADATA_KEY)?.value;
    return typeof value === 'string' ? value : undefined;
  }
  const transaction = native.transaction(CASAE_STORES.metadata, 'readonly');
  const metadata = await requestToPromise(
    transaction.objectStore(CASAE_STORES.metadata).get(ACTIVE_HOUSE_METADATA_KEY) as IDBRequest<
      LocalMetadata | undefined
    >,
  );
  await transactionToPromise(transaction);
  return typeof metadata?.value === 'string' ? metadata.value : undefined;
}

async function outboxForHouse(database: CasaeLocalDatabase, houseId: string) {
  const native = await database.getNativeDatabase();
  const values = native
    ? await (async () => {
        const transaction = native.transaction(CASAE_STORES.syncOutbox, 'readonly');
        const result = await requestToPromise(
          transaction.objectStore(CASAE_STORES.syncOutbox).index('houseId').getAll(houseId),
        );
        await transactionToPromise(transaction);
        return result;
      })()
    : [...database.getMemoryDatabase().syncOutbox.values()].filter(
        (entry) => entry.houseId === houseId,
      );
  return values.filter(
    (entry): entry is PurchaseSyncOutboxEntry =>
      entry.entityType === 'purchase-session' || entry.entityType === 'purchase-item',
  );
}

export async function exportPurchaseDiagnostics(requestedHouseId?: string) {
  const database = new CasaeLocalDatabase();
  const houseId = requestedHouseId ?? (await activeHouseId(database));
  if (!houseId) throw new Error('Nenhuma Casa ativa foi encontrada neste navegador.');
  const repository = new LocalPurchaseRepository(database);
  const [sessions, items, outbox] = await Promise.all([
    repository.listPersistedSessions(houseId),
    repository.listPersistedItems(houseId),
    outboxForHouse(database, houseId),
  ]);
  return {
    houseId,
    sessions: sessions.map((session) => {
      const sessionItems = items.filter((item) => item.purchaseSessionId === session.id);
      const visibleItems = sessionItems.filter((item) => !item.deletedAt);
      return {
        id: session.id,
        legacyId: session.legacyId,
        syncId: session.syncId,
        status: session.status,
        storeName: session.storeNameSnapshot,
        purchasedById: session.purchasedById,
        purchasedByName: session.purchasedByNameSnapshot,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        itemIds: visibleItems.map((item) => item.id),
        itemCount: visibleItems.length,
        totalPriceCents: visibleItems.reduce((sum, item) => sum + item.totalPriceCents, 0),
        fingerprint: purchaseSessionFingerprint({ ...session, items: sessionItems }),
      };
    }),
    items: items.map((item) => ({
      id: item.id,
      legacyId: item.legacyId,
      syncId: item.syncId,
      purchaseSessionId: item.purchaseSessionId,
      productName: item.productNameSnapshot,
      purchasedQuantity: item.purchasedQuantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
      purchasedById: item.purchasedById,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    })),
    outbox: outbox.map((entry) => ({
      id: entry.id,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      operation: entry.operation,
      version: entry.version,
      attempts: entry.attempts,
      lastError: entry.lastError,
    })),
  };
}

export function installPurchaseDiagnostics() {
  Object.defineProperty(window, '__CASAE_EXPORT_PURCHASE_SYNC__', {
    configurable: true,
    value: exportPurchaseDiagnostics,
  });
}

declare global {
  interface Window {
    __CASAE_EXPORT_PURCHASE_SYNC__?: typeof exportPurchaseDiagnostics;
  }
}
