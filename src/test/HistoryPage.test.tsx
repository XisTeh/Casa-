import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryService } from '../application/category-service';
import { ProductService } from '../application/product-service';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { App } from '../app/App';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

function createServices() {
  const database = new CasaeLocalDatabase(
    `casae-test-history-page-${Date.now()}-${Math.random()}`,
    { migrateLegacy: false },
  );
  const purchaseRepository = new LocalPurchaseRepository(database);
  const shoppingListService = new ShoppingListService(new LocalShoppingRepository(database));
  const productRepository = new LocalProductRepository(database);
  const categoryRepository = new LocalCategoryRepository(database);
  const productService = new ProductService(
    productRepository,
    categoryRepository,
    purchaseRepository,
    shoppingListService,
  );
  return {
    purchaseService: new PurchaseService(purchaseRepository, productService),
    shoppingListService,
    storeService: new StoreService(new LocalStoreRepository(database), purchaseRepository),
    productService,
    categoryService: new CategoryService(categoryRepository, productRepository),
  };
}

describe('HistoryPage', () => {
  beforeEach(() => window.history.pushState({}, '', '/historico'));

  it('mostra estado vazio sem criar histórico fictício', async () => {
    render(<App {...createServices()} />);
    expect(await screen.findByText('Nenhuma compra por aqui ainda.')).toBeInTheDocument();
    expect(screen.getByText(/compras finalizadas no modo comprar/i)).toBeInTheDocument();
  });

  it('alterna para preços e abre comparação histórica por produto', async () => {
    const user = userEvent.setup();
    const services = createServices();
    const category = (await services.categoryService.list()).find(
      (candidate) => candidate.legacyKey === 'mercearia',
    )!;
    const product = await services.productService.create({
      name: 'Café da integração',
      brand: 'Casaê',
      categoryId: category.id,
      defaultUnit: 'pacote',
      notes: '',
      favorite: false,
    });
    for (const purchase of [
      { store: { id: 'mercado-a', name: 'Mercado A' }, price: 600 },
      { store: { id: 'mercado-b', name: 'Mercado B' }, price: 700 },
    ]) {
      await services.purchaseService.startPurchase(purchase.store, 'quick');
      await services.purchaseService.addManualItem({
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        category: 'mercearia',
        categoryName: category.name,
        quantity: 1,
        unit: 'pacote',
        unitPriceCents: purchase.price,
      });
      await services.purchaseService.completePurchase();
      await new Promise((resolve) => window.setTimeout(resolve, 3));
    }

    render(<App {...services} />);
    await user.click(await screen.findByRole('tab', { name: 'Preços' }));
    const card = await screen.findByRole('button', { name: /Café da integração/i });
    expect(within(card).getByText(/\+16,7%/)).toBeInTheDocument();
    await user.click(card);
    const dialog = await screen.findByRole('dialog', { name: 'Café da integração' });
    expect(within(dialog).getByText('Comparação entre mercados')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Mercado A').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Mercado B').length).toBeGreaterThan(0);
  });
});
