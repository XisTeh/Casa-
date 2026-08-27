import type { PurchaseSession } from './purchase';

/** Deterministic canonical shape used to compare one purchase across clients and remote data. */
export function purchaseSessionFingerprint(session: PurchaseSession) {
  return JSON.stringify({
    sessionRemoteId: session.syncId ?? session.id,
    status: session.status,
    items: session.items
      .map((item) => ({
        itemRemoteId: item.syncId ?? item.id,
        purchasedQuantity: item.purchasedQuantity,
        unitPriceCents: item.unitPriceCents,
        deletedAt: item.deletedAt ?? null,
      }))
      .sort((first, second) => first.itemRemoteId.localeCompare(second.itemRemoteId)),
  });
}
