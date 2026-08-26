import { describe, expect, it } from 'vitest';
import { buildPriceHistoryProjections } from '../application/price-history-selectors';
import { ProductService } from '../application/product-service';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { HOUSE_ID } from '../domain/shopping-list';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function waitForDistinctTimestamp() {
  return new Promise((resolve) => window.setTimeout(resolve, 3));
}

describe('histórico de preços integrado aos serviços locais', () => {
  it('projeta três compras reais, preserva snapshots e acompanha o produto renomeado e inativo', async () => {
    const database = new CasaeLocalDatabase(
      `casae-test-price-integration-${Date.now()}-${Math.random()}`,
      { migrateLegacy: false },
    );
    const productRepository = new LocalProductRepository(database);
    const categoryRepository = new LocalCategoryRepository(database);
    const purchaseRepository = new LocalPurchaseRepository(database);
    const shopping = new ShoppingListService(new LocalShoppingRepository(database));
    const products = new ProductService(
      productRepository,
      categoryRepository,
      purchaseRepository,
      shopping,
    );
    const purchases = new PurchaseService(purchaseRepository, products);
    const category = (await categoryRepository.list(HOUSE_ID)).find(
      (candidate) => candidate.legacyKey === 'mercearia',
    )!;
    const product = await products.create({
      name: 'Café Original',
      brand: 'Casaê',
      categoryId: category.id,
      defaultUnit: 'pacote',
      notes: '',
      favorite: false,
    });

    for (const purchase of [
      { store: { id: 'atacadao', name: 'Atacadão' }, price: 600 },
      { store: { id: 'assai', name: 'Assaí' }, price: 700 },
      { store: { id: 'atacadao', name: 'Atacadão' }, price: 550 },
    ]) {
      await purchases.startPurchase(purchase.store, 'quick');
      await purchases.addManualItem({
        productId: product.id,
        productName: 'Café Original',
        brand: 'Casaê',
        category: 'mercearia',
        categoryName: category.name,
        quantity: 1,
        unit: 'pacote',
        unitPriceCents: purchase.price,
      });
      await purchases.completePurchase();
      await waitForDistinctTimestamp();
    }

    await products.update(product.id, { name: 'Café Renomeado' });
    await products.setActive(product.id, false);
    const sessions = await purchases.listCompletedSessions();
    const catalog = await products.list();
    const projection = buildPriceHistoryProjections(
      sessions,
      catalog,
      await categoryRepository.list(HOUSE_ID),
    )[0]!;

    expect(projection).toMatchObject({
      name: 'Café Renomeado',
      active: false,
      recordCount: 3,
    });
    expect(projection.primaryUnit.latestRecord.unitPriceCents).toBe(550);
    expect(projection.primaryUnit.previousRecord?.unitPriceCents).toBe(700);
    expect(projection.primaryUnit.variation.percentage).toBeCloseTo(-21.428, 2);
    expect(projection.primaryUnit.lowestRecord.unitPriceCents).toBe(550);
    expect(projection.primaryUnit.highestRecord.unitPriceCents).toBe(700);
    expect(projection.primaryUnit.averagePriceCents).toBe(617);
    expect(projection.primaryUnit.stores.map((store) => store.storeName)).toEqual([
      'Atacadão',
      'Assaí',
    ]);
    expect(
      projection.primaryUnit.records.every(
        (record) => record.item.productNameSnapshot === 'Café Original',
      ),
    ).toBe(true);
  });
});
