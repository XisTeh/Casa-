import { describe, expect, it } from 'vitest';
import { CategoryService } from '../application/category-service';
import { DuplicateProductError, ProductService } from '../application/product-service';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function databaseName(label: string) {
  return `casae-test-catalog-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createServices(label: string) {
  const name = databaseName(label);
  const database = new CasaeLocalDatabase(name, { migrateLegacy: false });
  const products = new LocalProductRepository(database);
  const categories = new LocalCategoryRepository(database);
  const purchases = new LocalPurchaseRepository(database);
  const shopping = new ShoppingListService(new LocalShoppingRepository(database));
  const productService = new ProductService(products, categories, purchases, shopping);
  const categoryService = new CategoryService(categories, products);
  const purchaseService = new PurchaseService(purchases, productService);
  const seeded = await shopping.list();
  await shopping.removeMany(seeded.map((item) => item.id));
  return { categoryService, databaseName: name, productService, purchaseService, shopping };
}

describe('catálogo de produtos e categorias', () => {
  it('cria, edita, favorita, desativa, reativa e impede nome normalizado duplicado', async () => {
    const { categoryService, productService } = await createServices('crud');
    const category = (await categoryService.list()).find((item) => item.legacyKey === 'mercearia')!;
    const rice = await productService.create({
      name: '  Arroz agulhinha  ',
      brand: 'Tio João',
      categoryId: category.id,
      defaultQuantity: 2,
      defaultUnit: 'pacote',
      notes: '',
      favorite: false,
    });
    await expect(
      productService.create({
        name: 'ÁRROZ AGULHINHA',
        brand: '',
        categoryId: category.id,
        defaultUnit: 'pacote',
        notes: '',
        favorite: false,
      }),
    ).rejects.toBeInstanceOf(DuplicateProductError);
    expect(await productService.update(rice.id, { brand: 'Camil' })).toMatchObject({
      brand: 'Camil',
    });
    expect(await productService.setFavorite(rice.id, true)).toMatchObject({ favorite: true });
    expect(await productService.setActive(rice.id, false)).toMatchObject({ active: false });
    expect(await productService.setActive(rice.id, true)).toMatchObject({ active: true });
  });

  it('cria e renomeia categoria, mas protege desativação enquanto estiver em uso', async () => {
    const { categoryService, productService } = await createServices('category');
    const category = await categoryService.create('Despensa especial');
    const renamed = await categoryService.rename(category.id, 'Despensa seca');
    expect(renamed.normalizedName).toBe('despensa seca');
    await productService.create({
      name: 'Grão especial',
      brand: '',
      categoryId: category.id,
      defaultUnit: 'pacote',
      notes: '',
      favorite: false,
    });
    await expect(categoryService.setActive(category.id, false)).rejects.toThrow(
      /mova os produtos/i,
    );
  });

  it('adiciona o produto à Lista uma vez e preserva productId e padrões', async () => {
    const { categoryService, productService, shopping } = await createServices('list');
    const category = (await categoryService.list()).find((item) => item.legacyKey === 'bebidas')!;
    const product = await productService.create({
      name: 'Água com gás',
      brand: 'Casaê',
      categoryId: category.id,
      defaultQuantity: 6,
      defaultUnit: 'garrafa',
      notes: 'Gelada',
      favorite: true,
    });
    expect((await productService.addToShoppingList(product.id)).status).toBe('added');
    expect((await productService.addToShoppingList(product.id)).status).toBe('already-present');
    expect(await shopping.list()).toMatchObject([
      { productId: product.id, categoryId: category.id, quantity: 6, unit: 'garrafa' },
    ]);
  });

  it('persiste recorrência manual no IndexedDB e preserva productId após reload', async () => {
    const {
      categoryService,
      databaseName: name,
      productService,
    } = await createServices('recurrence');
    const category = (await categoryService.list()).find(
      (item) => item.legacyKey === 'laticinios',
    )!;
    const saved = await productService.create({
      name: 'Iogurte recorrente',
      brand: '',
      categoryId: category.id,
      defaultQuantity: 4,
      defaultUnit: 'unidade',
      notes: '',
      favorite: false,
      isRecurring: true,
      recurrenceDays: 12,
    });

    const reloadedDatabase = new CasaeLocalDatabase(name, { migrateLegacy: false });
    const reloadedProducts = new LocalProductRepository(reloadedDatabase);
    await reloadedProducts.initialize();
    expect(await reloadedProducts.get(saved.houseId, saved.id)).toMatchObject({
      id: saved.id,
      houseId: saved.houseId,
      isRecurring: true,
      recurrenceDays: 12,
    });
  });

  it('mantém snapshots após edição e deriva último preço, mercado e data da compra', async () => {
    const { categoryService, productService, purchaseService, shopping } =
      await createServices('history');
    const category = (await categoryService.list()).find(
      (item) => item.legacyKey === 'laticinios',
    )!;
    const product = await productService.create({
      name: 'Leite integral premium',
      brand: 'Marca antiga',
      categoryId: category.id,
      defaultQuantity: 1,
      defaultUnit: 'litro',
      notes: '',
      favorite: false,
    });
    await productService.addToShoppingList(product.id);
    const [item] = await shopping.list();
    await purchaseService.startPurchase({ id: 'store-casae', name: 'Mercado Casaê' });
    await purchaseService.markPurchased(item!, 1, 599);
    await purchaseService.completePurchase();
    await productService.update(product.id, {
      name: 'Leite integral premium 1L',
      brand: 'Marca nova',
    });
    const [history] = await purchaseService.listCompletedSessions();
    expect(history!.items[0]).toMatchObject({
      productId: product.id,
      productNameSnapshot: 'Leite integral premium',
      brandSnapshot: 'Marca antiga',
    });
    const catalogProduct = (await productService.list()).find(
      (candidate) => candidate.id === product.id,
    );
    expect(catalogProduct).toMatchObject({
      name: 'Leite integral premium 1L',
      lastPurchase: { unitPriceCents: 599, storeName: 'Mercado Casaê' },
    });
  });

  it('cria automaticamente no catálogo um produto novo da Compra Rápida', async () => {
    const { categoryService, productService, purchaseService } = await createServices('quick');
    const category = (await categoryService.list()).find((item) => item.legacyKey === 'mercearia')!;
    const known = await productService.create({
      name: 'Arroz rápido QA',
      brand: '',
      categoryId: category.id,
      defaultQuantity: 2,
      defaultUnit: 'pacote',
      notes: '',
      favorite: false,
    });
    await purchaseService.startPurchase({ id: 'store-quick', name: 'Express' }, 'quick');
    const withKnown = await purchaseService.addManualItem({
      productId: known.id,
      productName: known.name,
      quantity: 2,
      unit: known.defaultUnit,
      unitPriceCents: 999,
    });
    expect(withKnown.items[0]?.productId).toBe(known.id);
    const session = await purchaseService.addManualItem({
      productName: 'Molho barbecue',
      quantity: 1,
      unit: 'unidade',
      unitPriceCents: 1290,
    });
    const product = (await productService.list()).find(
      (candidate) => candidate.name === 'Molho barbecue',
    );
    expect(product).toMatchObject({ active: true, defaultUnit: 'unidade' });
    expect(session.items[1]?.productId).toBe(product?.id);
  });

  it('cria item manual da Compra Rápida em Outros numa Casa online recém-inicializada', async () => {
    const database = new CasaeLocalDatabase(`quick-online-${Date.now()}-${Math.random()}`, {
      migrateLegacy: false,
    });
    const categoryRepository = new LocalCategoryRepository(database);
    const productRepository = new LocalProductRepository(database);
    const purchaseRepository = new LocalPurchaseRepository(database);
    const shopping = new ShoppingListService(new LocalShoppingRepository(database));
    const categories = new CategoryService(categoryRepository, productRepository);
    const products = new ProductService(
      productRepository,
      categoryRepository,
      purchaseRepository,
      shopping,
    );
    const purchases = new PurchaseService(purchaseRepository, products);
    const houseId = '842a92c9-7436-46aa-9667-01fa6dc4cf55';

    await categories.ensureDefaultCategoriesForHouse(houseId);
    await purchases.startPurchase({ id: 'store-online', name: 'Mercado online' }, 'quick', {
      houseId,
      memberId: 'user-online',
      memberName: 'Ronnan',
    });
    const session = await purchases.addManualItem(
      {
        productName: 'Produto manual online',
        quantity: 1,
        unit: 'unidade',
        unitPriceCents: 750,
      },
      houseId,
    );

    const outros = (await categoryRepository.list(houseId)).find(
      (category) => category.legacyKey === 'outros',
    );
    const created = (await products.list(houseId)).find(
      (product) => product.name === 'Produto manual online',
    );
    expect(created?.categoryId).toBe(outros?.id);
    expect(session.items[0]?.productId).toBe(created?.id);
  });
});
