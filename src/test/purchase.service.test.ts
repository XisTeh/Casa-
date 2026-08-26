import { describe, expect, it } from 'vitest';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { HOUSE_ID } from '../domain/shopping-list';
import { getPurchaseSubtotal } from '../domain/purchase';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function databaseName(label: string) {
  return `casae-test-service-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createServices(label: string) {
  const database = new CasaeLocalDatabase(databaseName(label), { migrateLegacy: false });
  const shoppingRepository = new LocalShoppingRepository(database);
  const shoppingListService = new ShoppingListService(shoppingRepository);
  const purchaseRepository = new LocalPurchaseRepository(database);
  const purchaseService = new PurchaseService(purchaseRepository);
  const items = await shoppingListService.list();
  return { items, purchaseRepository, purchaseService, shoppingListService };
}

describe('PurchaseService', () => {
  it('inicia somente uma sessão, impede item duplicado e permite desfazer', async () => {
    const { items, purchaseService } = await createServices('active');
    const started = await purchaseService.startPurchase({
      id: 'store-atacadao',
      name: '  Atacadão  ',
    });
    const sameSession = await purchaseService.startPurchase({
      id: 'store-outro',
      name: 'Outro mercado',
    });

    expect(started.storeNameSnapshot).toBe('Atacadão');
    expect(sameSession.id).toBe(started.id);

    const rice = items.find((item) => item.id === 'seed-arroz')!;
    await purchaseService.markPurchased(rice, 1.5, 899);
    const withoutDuplicate = await purchaseService.markPurchased(rice, 2, 999);
    expect(withoutDuplicate.items).toHaveLength(1);
    expect(withoutDuplicate.items[0]?.totalPriceCents).toBe(1349);

    const undone = await purchaseService.undoPurchasedItem(rice.id);
    expect(undone.items).toEqual([]);
  });

  it('cancela sem alterar a lista original', async () => {
    const { items, purchaseService, shoppingListService } = await createServices('cancel');
    await purchaseService.startPurchase({ id: 'store-bairro', name: 'Mercado Bairro' });
    await purchaseService.markPurchased(items[0]!, 1, 500);

    await purchaseService.cancelPurchase();

    expect(await purchaseService.getActiveSession()).toBeNull();
    expect(await shoppingListService.list()).toHaveLength(items.length);
    expect(await purchaseService.listCompletedSessions()).toEqual([]);
  });

  it('conclui parcialmente, remove só os comprados e conserva snapshots no histórico', async () => {
    const { items, purchaseRepository, purchaseService, shoppingListService } =
      await createServices('complete');
    const rice = items.find((item) => item.id === 'seed-arroz')!;
    const milk = items.find((item) => item.id === 'seed-leite')!;
    await purchaseService.startPurchase({ id: 'store-casae', name: 'Supermercado Casaê' });
    await purchaseService.markPurchased(rice, 2, 875);
    await purchaseService.markPurchased(milk, 1.5, 499);

    const completed = await purchaseService.completePurchase();
    const remaining = await shoppingListService.list();
    const [history] = await purchaseRepository.listCompletedSessions(HOUSE_ID);

    expect(completed.totalPriceCents).toBe(2499);
    expect(remaining).toHaveLength(items.length - 2);
    expect(remaining.some((item) => item.id === rice.id)).toBe(false);
    expect(remaining.some((item) => item.id === milk.id)).toBe(false);
    expect(history).toMatchObject({
      storeNameSnapshot: 'Supermercado Casaê',
      totalPriceCents: 2499,
      items: [
        { productNameSnapshot: 'Arroz', plannedQuantity: 2 },
        { productNameSnapshot: 'Leite integral', purchasedQuantity: 1.5 },
      ],
    });
    expect(await purchaseService.getActiveSession()).toBeNull();
  });

  it('recusa finalizar um carrinho vazio', async () => {
    const { purchaseService } = await createServices('empty');
    await purchaseService.startPurchase({ id: 'store-mercado', name: 'Mercado' });
    await expect(purchaseService.completePurchase()).rejects.toThrow(/pelo menos um produto/i);
  });

  it('inicia compra rápida sem lista, calcula, edita, remove e persiste após reload', async () => {
    const { items, purchaseRepository, purchaseService, shoppingListService } =
      await createServices('quick');
    await shoppingListService.removeMany(items.map((item) => item.id));

    const started = await purchaseService.startPurchase(
      { id: 'store-quick', name: 'Mercado Rápido' },
      'quick',
    );
    expect(started.entryMode).toBe('quick');
    expect(await shoppingListService.list()).toEqual([]);

    const first = await purchaseService.addManualItem({
      productId: 'product-coca',
      productName: 'Coca-Cola 2L',
      brand: 'Coca-Cola',
      category: 'bebidas',
      quantity: 2,
      unit: 'garrafa',
      unitPriceCents: 899,
    });
    expect(first.items[0]).toMatchObject({
      origin: 'manual',
      productId: 'product-coca',
      productNameSnapshot: 'Coca-Cola 2L',
      brandSnapshot: 'Coca-Cola',
      categorySnapshot: 'bebidas',
      totalPriceCents: 1798,
    });

    const withTwo = await purchaseService.addManualItem({
      productName: 'Chocolate',
      quantity: 3,
      unit: 'unidade',
      unitPriceCents: 450,
    });
    expect(getPurchaseSubtotal(withTwo.items)).toBe(3148);

    const edited = await purchaseService.updateManualItem(withTwo.items[0]!.id, {
      productId: 'product-coca',
      productName: 'Coca-Cola 2L',
      brand: 'Coca-Cola',
      category: 'bebidas',
      quantity: 1,
      unit: 'garrafa',
      unitPriceCents: 999,
    });
    expect(getPurchaseSubtotal(edited.items)).toBe(2349);

    const withoutChocolate = await purchaseService.removePurchaseItem(edited.items[1]!.id);
    expect(withoutChocolate.items).toHaveLength(1);
    expect(await shoppingListService.list()).toEqual([]);

    const completed = await purchaseService.completePurchase();
    expect(completed.totalPriceCents).toBe(999);
    const reloadedService = new PurchaseService(purchaseRepository);
    expect(await reloadedService.getActiveSession()).toBeNull();
    expect(await reloadedService.listCompletedSessions()).toMatchObject([
      {
        entryMode: 'quick',
        storeNameSnapshot: 'Mercado Rápido',
        totalPriceCents: 999,
        items: [
          {
            origin: 'manual',
            productId: 'product-coca',
            productNameSnapshot: 'Coca-Cola 2L',
            unitPriceCents: 999,
          },
        ],
      },
    ]);
  });

  it('combina itens da Lista e manuais sem devolver nem excluir a origem errada', async () => {
    const { items, purchaseService, shoppingListService } = await createServices('mixed');
    const rice = items.find((item) => item.id === 'seed-arroz')!;
    await purchaseService.startPurchase({ id: 'store-mixed', name: 'Mercado Misto' }, 'list');
    await purchaseService.markPurchased(rice, 2, 800);
    const mixed = await purchaseService.addManualItem({
      productName: 'Refrigerante inesperado',
      quantity: 1,
      unit: 'garrafa',
      unitPriceCents: 700,
    });
    const manual = mixed.items.find((item) => item.origin === 'manual')!;

    await purchaseService.removePurchaseItem(manual.id);
    expect((await shoppingListService.list()).some((item) => item.id === rice.id)).toBe(true);
    expect(
      (await shoppingListService.list()).some(
        (item) => item.productName === 'Refrigerante inesperado',
      ),
    ).toBe(false);

    const afterUndo = await purchaseService.undoPurchasedItem(rice.id);
    expect(afterUndo.items).toEqual([]);
    expect((await shoppingListService.list()).some((item) => item.id === rice.id)).toBe(true);

    await purchaseService.markPurchased(rice, 2, 800);
    await purchaseService.addManualItem({
      productName: 'Refrigerante inesperado',
      quantity: 1,
      unit: 'garrafa',
      unitPriceCents: 700,
    });
    await purchaseService.completePurchase();
    const remaining = await shoppingListService.list();
    expect(remaining.some((item) => item.id === rice.id)).toBe(false);
    expect(remaining).toHaveLength(items.length - 1);
  });
});
