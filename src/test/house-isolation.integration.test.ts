import { describe, expect, it } from 'vitest';
import { BudgetService } from '../application/budget-service';
import { CategoryService } from '../application/category-service';
import { HouseService } from '../application/house-service';
import { ProductService } from '../application/product-service';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { getMonthlySpending } from '../application/spending-selectors';
import { StoreService } from '../application/store-service';
import { LocalBudgetRepository } from '../infrastructure/budget/LocalBudgetRepository';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalHouseRepository } from '../infrastructure/house/LocalHouseRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

describe('isolamento completo por Casa', () => {
  it('não mistura Lista, Produtos, Categorias, Mercados, Compras, Gastos ou Orçamento', async () => {
    const database = new CasaeLocalDatabase(`house-isolation-${Date.now()}-${Math.random()}`, {
      migrateLegacy: false,
    });
    const shoppingRepository = new LocalShoppingRepository(database);
    const purchaseRepository = new LocalPurchaseRepository(database);
    const productRepository = new LocalProductRepository(database);
    const categoryRepository = new LocalCategoryRepository(database);
    const storeRepository = new LocalStoreRepository(database);
    const budgetRepository = new LocalBudgetRepository(database);
    const shopping = new ShoppingListService(shoppingRepository);
    const products = new ProductService(
      productRepository,
      categoryRepository,
      purchaseRepository,
      shopping,
    );
    const purchases = new PurchaseService(purchaseRepository, products);
    const stores = new StoreService(storeRepository, purchaseRepository);
    const budgets = new BudgetService(budgetRepository);
    const houses = new HouseService(new LocalHouseRepository(database), categoryRepository);
    const categories = new CategoryService(categoryRepository, productRepository);

    const houseA = await houses.getSnapshot();
    const actorA = {
      houseId: houseA.activeHouse.id,
      memberId: houseA.activeMember.id,
      memberName: houseA.activeMember.displayName,
    };
    for (const item of await shopping.list(actorA.houseId))
      await shopping.remove(item.id, actorA.houseId);
    const categoryA = (await categories.list(actorA.houseId))[0]!;
    const itemA = await shopping.create(
      {
        productName: 'Arroz A',
        quantity: 1,
        unit: 'pacote',
        category: 'mercearia',
        preferredBrand: '',
        notes: '',
        priority: 'normal',
      },
      actorA,
    );
    const productA = await products.create(
      {
        name: 'Arroz A',
        brand: '',
        categoryId: categoryA.id,
        defaultQuantity: 1,
        defaultUnit: 'pacote',
        notes: '',
        favorite: false,
      },
      actorA.houseId,
    );
    const storeA = await stores.create(
      { name: 'Atacadão A', nickname: '', address: '', notes: '' },
      actorA.houseId,
    );
    await budgets.setMonthlyBudget(2026, 8, 50_000, actorA.houseId);
    await purchases.startPurchase(storeA, 'quick', actorA);
    await purchases.addManualItem(
      { productName: 'Compra A', quantity: 1, unit: 'unidade', unitPriceCents: 10_000 },
      actorA.houseId,
    );
    await purchases.completePurchase(actorA.houseId);

    const houseB = await houses.createHouse('Casa B', houseA.activeMember);
    const actorB = {
      houseId: houseB.activeHouse.id,
      memberId: houseB.activeMember.id,
      memberName: houseB.activeMember.displayName,
    };
    expect(await shopping.list(actorB.houseId)).toEqual([]);
    expect(await products.list(actorB.houseId)).toEqual([]);
    expect(await stores.list(actorB.houseId)).toEqual([]);
    expect(await purchases.listCompletedSessions(actorB.houseId)).toEqual([]);
    expect(await budgets.list(actorB.houseId)).toEqual([]);
    expect(await categories.list(actorB.houseId)).toHaveLength(11);

    const categoryB = (await categories.list(actorB.houseId))[0]!;
    await shopping.create(
      {
        productName: 'Café B',
        quantity: 1,
        unit: 'pacote',
        category: 'mercearia',
        preferredBrand: '',
        notes: '',
        priority: 'normal',
      },
      actorB,
    );
    await products.create(
      {
        name: 'Café B',
        brand: '',
        categoryId: categoryB.id,
        defaultQuantity: 1,
        defaultUnit: 'pacote',
        notes: '',
        favorite: false,
      },
      actorB.houseId,
    );
    const storeB = await stores.create(
      { name: 'Extra B', nickname: '', address: '', notes: '' },
      actorB.houseId,
    );
    await budgets.setMonthlyBudget(2026, 8, 20_000, actorB.houseId);
    await purchases.startPurchase(storeB, 'quick', actorB);
    await purchases.addManualItem(
      { productName: 'Compra B', quantity: 1, unit: 'unidade', unitPriceCents: 3_000 },
      actorB.houseId,
    );
    await purchases.completePurchase(actorB.houseId);

    expect((await shopping.list(actorA.houseId)).map((item) => item.productName)).toEqual([
      'Arroz A',
    ]);
    expect((await shopping.list(actorB.houseId)).map((item) => item.productName)).toEqual([
      'Café B',
    ]);
    expect((await products.list(actorA.houseId)).map((product) => product.name)).toEqual(
      expect.arrayContaining(['Arroz A', 'Compra A']),
    );
    expect((await products.list(actorB.houseId)).map((product) => product.name)).toEqual(
      expect.arrayContaining(['Café B', 'Compra B']),
    );
    expect((await stores.list(actorA.houseId)).map((store) => store.name)).toEqual(['Atacadão A']);
    expect((await stores.list(actorB.houseId)).map((store) => store.name)).toEqual(['Extra B']);
    const sessionsA = await purchases.listCompletedSessions(actorA.houseId);
    const sessionsB = await purchases.listCompletedSessions(actorB.houseId);
    expect(itemA).toMatchObject({
      addedByMemberId: actorA.memberId,
      addedByNameSnapshot: actorA.memberName,
    });
    expect(sessionsA[0]).toMatchObject({
      purchasedById: actorA.memberId,
      purchasedByNameSnapshot: actorA.memberName,
    });
    expect(sessionsB[0]).toMatchObject({
      purchasedById: actorB.memberId,
      purchasedByNameSnapshot: actorB.memberName,
    });
    expect(getMonthlySpending(sessionsA, { year: 2026, month: 8 })).toBe(10_000);
    expect(getMonthlySpending(sessionsB, { year: 2026, month: 8 })).toBe(3_000);
    expect((await budgets.list(actorA.houseId))[0]?.amountCents).toBe(50_000);
    expect((await budgets.list(actorB.houseId))[0]?.amountCents).toBe(20_000);
    await expect(
      shoppingRepository.update(actorB.houseId, itemA.id, { productName: 'Vazamento' }),
    ).rejects.toThrow(/não existe/i);
    await expect(storeRepository.remove(actorB.houseId, storeA.id)).rejects.toThrow(/não existe/i);
    expect(await productRepository.get(actorB.houseId, productA.id)).toBeUndefined();
    expect(await categoryRepository.get(actorB.houseId, categoryA.id)).toBeUndefined();
  });
});
