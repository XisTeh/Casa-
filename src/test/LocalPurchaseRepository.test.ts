import { describe, expect, it } from 'vitest';
import type { PersistedPurchaseSession, PurchaseItem } from '../domain/purchase';
import { HOUSE_ID } from '../domain/shopping-list';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';

function databaseName(label: string) {
  return `casae-test-purchase-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeSession(id: string): PersistedPurchaseSession {
  return {
    id,
    houseId: HOUSE_ID,
    storeNameSnapshot: 'Mercado Central',
    status: 'active',
    startedAt: '2026-08-25T13:00:00.000Z',
    purchasedByNameSnapshot: 'Raabe',
    totalPriceCents: 0,
  };
}

function makeItem(sessionId: string): PurchaseItem {
  return {
    id: `${sessionId}:item-arroz`,
    houseId: HOUSE_ID,
    purchaseSessionId: sessionId,
    sourceShoppingItemId: 'item-arroz',
    productNameSnapshot: 'Arroz',
    brandSnapshot: 'Tio João',
    categorySnapshot: 'mercearia',
    prioritySnapshot: 'high',
    notesSnapshot: '',
    plannedQuantity: 2,
    purchasedQuantity: 1.5,
    unitSnapshot: 'pacote',
    unitPriceCents: 899,
    totalPriceCents: 1349,
    storeNameSnapshot: 'Mercado Central',
    purchasedByNameSnapshot: 'Raabe',
    purchasedAt: '2026-08-25T13:15:00.000Z',
  };
}

describe('LocalPurchaseRepository', () => {
  it('retoma a sessão ativa e seus itens em outra instância', async () => {
    const name = databaseName('resume');
    const first = new LocalPurchaseRepository(name);
    await first.initialize();
    const session = makeSession('purchase-resume');
    await first.createSession(session);
    await first.savePurchasedItem(HOUSE_ID, makeItem(session.id));

    const restored = new LocalPurchaseRepository(name);
    await restored.initialize();

    expect(await restored.getActiveSession(HOUSE_ID)).toMatchObject({
      id: session.id,
      items: [{ productNameSnapshot: 'Arroz', totalPriceCents: 1349 }],
    });
  });

  it('descarta a sessão e seus itens ao cancelar', async () => {
    const repository = new LocalPurchaseRepository(databaseName('cancel'));
    const session = makeSession('purchase-cancel');
    await repository.createSession(session);
    await repository.savePurchasedItem(HOUSE_ID, makeItem(session.id));

    await repository.cancelSession(HOUSE_ID, session.id);

    expect(await repository.getActiveSession(HOUSE_ID)).toBeNull();
    expect(await repository.listCompletedSessions(HOUSE_ID)).toEqual([]);
  });

  it('preserva snapshots e total no histórico concluído', async () => {
    const name = databaseName('history');
    const repository = new LocalPurchaseRepository(name);
    const session = makeSession('purchase-completed');
    await repository.createSession(session);
    await repository.savePurchasedItem(HOUSE_ID, makeItem(session.id));
    await repository.completeSession(HOUSE_ID, session.id, '2026-08-25T14:00:00.000Z', 1349, []);

    const restored = new LocalPurchaseRepository(name);
    const [completed] = await restored.listCompletedSessions(HOUSE_ID);

    expect(completed).toMatchObject({
      status: 'completed',
      totalPriceCents: 1349,
      storeNameSnapshot: 'Mercado Central',
      items: [{ productNameSnapshot: 'Arroz', brandSnapshot: 'Tio João' }],
    });
    expect(await restored.getActiveSession(HOUSE_ID)).toBeNull();
  });

  it('restaura modo rápido e item manual editável após uma nova instância', async () => {
    const name = databaseName('quick-reload');
    const first = new LocalPurchaseRepository(name);
    const session = { ...makeSession('purchase-quick-reload'), entryMode: 'quick' as const };
    await first.createSession(session);
    const manualItem: PurchaseItem = {
      ...makeItem(session.id),
      id: `${session.id}:manual-cola`,
      origin: 'manual',
      sourceShoppingItemId: undefined,
      productId: 'product-cola',
      productNameSnapshot: 'Cola 2L',
    };
    await first.savePurchasedItem(HOUSE_ID, manualItem);

    const restored = new LocalPurchaseRepository(name);
    expect(await restored.getActiveSession(HOUSE_ID)).toMatchObject({
      entryMode: 'quick',
      items: [
        {
          id: manualItem.id,
          origin: 'manual',
          productId: 'product-cola',
          sourceShoppingItemId: undefined,
        },
      ],
    });
  });
});
