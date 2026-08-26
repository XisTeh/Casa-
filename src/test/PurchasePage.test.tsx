import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { App } from '../app/App';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

function databaseName(label: string) {
  return `casae-test-page-purchase-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createServices() {
  const database = new CasaeLocalDatabase(databaseName('unified'), { migrateLegacy: false });
  const shoppingListService = new ShoppingListService(new LocalShoppingRepository(database));
  const purchaseRepository = new LocalPurchaseRepository(database);
  const purchaseService = new PurchaseService(purchaseRepository);
  const storeService = new StoreService(new LocalStoreRepository(database), purchaseRepository);
  return { purchaseService, shoppingListService, storeService };
}

describe('PurchasePage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/comprar');
  });

  it('executa compra parcial e reflete o histórico real no Dashboard', async () => {
    const user = userEvent.setup();
    const services = createServices();
    render(<App {...services} />);

    await screen.findByRole('heading', { name: 'Hora de ir às compras.' });
    await user.click(screen.getByRole('button', { name: 'Comprar usando a lista' }));
    const startDialog = screen.getByRole('dialog', { name: /onde você está comprando/i });
    await user.type(within(startDialog).getByLabelText(/nome do novo mercado/i), 'Empório Casaê');
    await user.click(within(startDialog).getByRole('button', { name: 'Comprar usando a lista' }));

    expect(await screen.findByRole('heading', { name: 'Empório Casaê' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /arroz/i }));
    const itemDialog = screen.getByRole('dialog', { name: 'Arroz' });
    const quantityInput = within(itemDialog).getByLabelText(/quantidade comprada/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, '2');
    await user.type(within(itemDialog).getByLabelText(/preço por pacote/i), '8,75');
    expect(within(itemDialog).getByText(/17,50/)).toBeInTheDocument();
    await user.click(within(itemDialog).getByRole('button', { name: 'Adicionar ao carrinho' }));

    expect(await screen.findByRole('button', { name: 'Desfazer Arroz' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Finalizar compra' }));
    const confirmation = screen.getByRole('dialog', { name: 'Finalizar compra?' });
    expect(within(confirmation).getByText('7 itens continuarão na sua lista.')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Finalizar compra' }));

    expect(await screen.findByText(/finalizada com sucesso/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Última compra concluída')).toHaveTextContent('Empório Casaê');
    expect(screen.getByLabelText('Última compra concluída')).toHaveTextContent('R$ 17,50');

    await user.click(screen.getAllByRole('link', { name: 'Início' })[0]!);
    const latestPurchaseCard = await screen.findByText('Empório Casaê');
    expect(latestPurchaseCard).toBeInTheDocument();
    expect(screen.getByText('7 itens faltando')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Abrir histórico de compras' }));
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Empório Casaê/i }));
    const detail = screen.getByRole('dialog', { name: 'Empório Casaê' });
    expect(within(detail).getByText('Arroz')).toBeInTheDocument();
    expect(within(detail).getByText('Tio João', { exact: false })).toBeInTheDocument();
    expect(within(detail).getAllByText(/17,50/).length).toBeGreaterThan(0);
  });

  it('cancela a sessão sem remover produtos da lista', async () => {
    const user = userEvent.setup();
    const services = createServices();
    render(<App {...services} />);

    await screen.findByRole('heading', { name: 'Hora de ir às compras.' });
    await user.click(screen.getByRole('button', { name: 'Comprar usando a lista' }));
    await user.type(screen.getByLabelText(/nome do novo mercado/i), 'Mercado Bairro');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Comprar usando a lista' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancelar compra' }));
    const confirmation = screen.getByRole('dialog', { name: 'Cancelar esta compra?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Cancelar compra' }));

    expect(await screen.findByText(/lista continua intacta/i)).toBeInTheDocument();
    expect(screen.getByText(/itens na lista/i)).toHaveTextContent('8 itens na lista');
  });

  it('seleciona um mercado já cadastrado ao iniciar', async () => {
    const user = userEvent.setup();
    const services = createServices();
    await services.storeService.create({
      name: 'Atacadão cadastrado',
      nickname: 'Compra do mês',
      address: '',
      notes: '',
    });
    render(<App {...services} />);

    await screen.findByRole('heading', { name: 'Hora de ir às compras.' });
    await user.click(screen.getByRole('button', { name: 'Comprar usando a lista' }));
    const dialog = screen.getByRole('dialog', { name: /onde você está comprando/i });
    expect(within(dialog).getByText('Compra do mês')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Comprar usando a lista' }));
    expect(await screen.findByRole('heading', { name: 'Atacadão cadastrado' })).toBeInTheDocument();
  });

  it('permite compra rápida com lista vazia e edição contínua de item manual', async () => {
    const user = userEvent.setup();
    const services = createServices();
    const seededItems = await services.shoppingListService.list();
    await services.shoppingListService.removeMany(seededItems.map((item) => item.id));
    render(<App {...services} />);

    await screen.findByRole('heading', { name: 'Hora de ir às compras.' });
    expect(screen.getByRole('button', { name: 'Comprar usando a lista' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Começar compra rápida' }));
    const startDialog = screen.getByRole('dialog', { name: /onde você está comprando/i });
    await user.type(within(startDialog).getByLabelText(/nome do novo mercado/i), 'Express Casaê');
    await user.click(within(startDialog).getByRole('button', { name: 'Começar compra rápida' }));

    expect(await screen.findByText(/compra rápida iniciada/i)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Produto' }), 'Coca-Cola 2L');
    await user.clear(screen.getByLabelText('Quantidade do item rápido'));
    await user.type(screen.getByLabelText('Quantidade do item rápido'), '2');
    await user.type(screen.getByLabelText('Preço unitário do item rápido'), '8,99');
    expect(screen.getByText(/2 × R\$ 8,99/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar e continuar' }));

    expect(await screen.findByRole('button', { name: 'Editar Coca-Cola 2L' })).toBeInTheDocument();
    expect(screen.getAllByText('R$ 17,98').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Produto' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Editar Coca-Cola 2L' }));
    const editQuantity = screen.getByLabelText('Quantidade do item rápido');
    await user.clear(editQuantity);
    await user.type(editQuantity, '3');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('button', { name: 'Remover Coca-Cola 2L' })).toBeInTheDocument();
    expect(screen.getAllByText('R$ 26,97').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Remover Coca-Cola 2L' }));
    expect(await screen.findByText('O carrinho ainda está vazio.')).toBeInTheDocument();
    expect(await services.shoppingListService.list()).toEqual([]);
  });
});
