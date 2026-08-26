import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgetService } from '../application/budget-service';
import { CategoryService } from '../application/category-service';
import { ProductService } from '../application/product-service';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { App } from '../app/App';
import { LocalBudgetRepository } from '../infrastructure/budget/LocalBudgetRepository';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

function createServices() {
  const database = new CasaeLocalDatabase(
    `casae-test-spending-page-${Date.now()}-${Math.random()}`,
    { migrateLegacy: false },
  );
  const purchases = new LocalPurchaseRepository(database);
  const productRepository = new LocalProductRepository(database);
  const categoryRepository = new LocalCategoryRepository(database);
  const shoppingListService = new ShoppingListService(new LocalShoppingRepository(database));
  const productService = new ProductService(
    productRepository,
    categoryRepository,
    purchases,
    shoppingListService,
  );
  return {
    shoppingListService,
    purchaseService: new PurchaseService(purchases, productService),
    storeService: new StoreService(new LocalStoreRepository(database), purchases),
    productService,
    categoryService: new CategoryService(categoryRepository, productRepository),
    budgetService: new BudgetService(new LocalBudgetRepository(database)),
  };
}

describe('SpendingPage', () => {
  beforeEach(() => window.history.pushState({}, '', '/gastos'));

  it('mostra estado vazio real e permite definir orçamento sem compras', async () => {
    const user = userEvent.setup();
    render(<App {...createServices()} />);
    expect(await screen.findByText('Nenhum gasto registrado neste mês.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Definir orçamento' }));
    const dialog = screen.getByRole('dialog', { name: 'Definir orçamento' });
    await user.type(within(dialog).getByLabelText('Orçamento do mês'), '1.500,00');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar orçamento' }));
    expect((await screen.findAllByText(/1\.500,00/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('0% utilizado')).toHaveLength(2);
  });

  it('deriva gastos da compra, edita orçamento e reflete no Dashboard sem reload', async () => {
    const user = userEvent.setup();
    const services = createServices();
    await services.purchaseService.startPurchase(
      { id: 'store-page', name: 'Mercado Página' },
      'quick',
    );
    await services.purchaseService.addManualItem({
      productName: 'Sabão antigo',
      category: 'limpeza',
      categoryName: 'Limpeza histórica',
      quantity: 1,
      unit: 'unidade',
      unitPriceCents: 1_050,
    });
    await services.purchaseService.completePurchase();
    const now = new Date();
    await services.budgetService.setMonthlyBudget(now.getFullYear(), now.getMonth() + 1, 10_000);

    render(<App {...services} />);
    expect(await screen.findByRole('heading', { name: 'Gastos' })).toBeInTheDocument();
    expect(screen.getAllByText(/10,50/).length).toBeGreaterThan(0);
    expect(screen.getByText('Limpeza histórica')).toBeInTheDocument();
    expect(screen.getAllByText('Mercado Página').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Mercado Página/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar orçamento' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar orçamento' });
    const input = within(dialog).getByLabelText('Orçamento do mês');
    await user.clear(input);
    await user.type(input, '200,00');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar orçamento' }));
    expect(await screen.findByText(/189,50 disponíveis/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: 'Início' })[0]!);
    const spendingCard = screen.getByText(/Gastos de/i).closest('.summary-card') as HTMLElement;
    expect(within(spendingCard).getByText(/10,50/)).toBeInTheDocument();
    expect(within(spendingCard).getByText(/de R.*200,00/)).toBeInTheDocument();
  });
});
