import { describe, expect, it } from 'vitest';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

function createServices() {
  const name = `casae-test-store-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const database = new CasaeLocalDatabase(name, { migrateLegacy: false });
  const purchaseRepository = new LocalPurchaseRepository(database);
  return {
    purchaseService: new PurchaseService(purchaseRepository),
    shoppingService: new ShoppingListService(new LocalShoppingRepository(database)),
    storeService: new StoreService(new LocalStoreRepository(database), purchaseRepository),
  };
}

describe('StoreService', () => {
  it('cria, edita, desativa e reativa um mercado', async () => {
    const { storeService } = createServices();
    const created = await storeService.create({
      name: ' Mercado Central ',
      nickname: ' Perto ',
      address: '',
      notes: '',
    });
    expect(created).toMatchObject({ name: 'Mercado Central', nickname: 'Perto', active: true });
    expect(await storeService.update(created.id, { nickname: 'Preferido' })).toMatchObject({
      nickname: 'Preferido',
    });
    expect(await storeService.setActive(created.id, false)).toMatchObject({ active: false });
    expect(await storeService.setActive(created.id, true)).toMatchObject({ active: true });
  });

  it('deriva estatísticas reais e preserva o nome histórico depois de renomear', async () => {
    const { purchaseService, shoppingService, storeService } = createServices();
    const store = await storeService.create({
      name: 'Mercado Original',
      nickname: '',
      address: '',
      notes: '',
    });
    const [item] = await shoppingService.list();
    await purchaseService.startPurchase(store);
    await purchaseService.markPurchased(item!, 1, 1290);
    await purchaseService.completePurchase();
    await storeService.update(store.id, { name: 'Mercado Renomeado' });

    expect(await storeService.list()).toMatchObject([
      { name: 'Mercado Renomeado', purchaseCount: 1, totalSpentCents: 1290 },
    ]);
    expect((await purchaseService.listCompletedSessions())[0]).toMatchObject({
      storeId: store.id,
      storeNameSnapshot: 'Mercado Original',
    });
    await expect(storeService.remove(store.id)).rejects.toThrow(/histórico/i);
  });

  it('permite excluir apenas mercado sem histórico', async () => {
    const { storeService } = createServices();
    const store = await storeService.create({
      name: 'Temporário',
      nickname: '',
      address: '',
      notes: '',
    });
    await storeService.remove(store.id);
    expect(await storeService.list()).toEqual([]);
  });
});
