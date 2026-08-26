import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { App } from '../app/App';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';

function createServices() {
  const database = new CasaeLocalDatabase(`casae-test-store-page-${Date.now()}-${Math.random()}`, {
    migrateLegacy: false,
  });
  const purchaseRepository = new LocalPurchaseRepository(database);
  return {
    purchaseService: new PurchaseService(purchaseRepository),
    shoppingListService: new ShoppingListService(new LocalShoppingRepository(database)),
    storeService: new StoreService(new LocalStoreRepository(database), purchaseRepository),
  };
}

describe('StorePage', () => {
  beforeEach(() => window.history.pushState({}, '', '/mercados'));

  it('cadastra, edita, desativa, reativa e exclui mercado sem histórico', async () => {
    const user = userEvent.setup();
    render(<App {...createServices()} />);
    expect(await screen.findByText('Nenhum mercado cadastrado.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar primeiro mercado' }));
    const createDialog = screen.getByRole('dialog', { name: 'Adicionar mercado' });
    await user.type(within(createDialog).getByLabelText(/^nome/i), 'Hortifruti Verde');
    await user.type(within(createDialog).getByLabelText(/apelido/i), 'Verdinho');
    await user.click(within(createDialog).getByRole('button', { name: 'Adicionar mercado' }));

    expect(await screen.findByRole('heading', { name: 'Hortifruti Verde' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar Hortifruti Verde' }));
    const editDialog = screen.getByRole('dialog', { name: 'Hortifruti Verde' });
    const nickname = within(editDialog).getByLabelText(/apelido/i);
    await user.clear(nickname);
    await user.type(nickname, 'Feira favorita');
    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Feira favorita')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desativar Hortifruti Verde' }));
    expect(await screen.findByText('Inativo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reativar Hortifruti Verde' }));
    expect(await screen.findByText('Ativo')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir Hortifruti Verde' }));
    const deleteDialog = screen.getByRole('dialog', { name: 'Excluir Hortifruti Verde?' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Excluir mercado' }));
    expect(await screen.findByText('Nenhum mercado cadastrado.')).toBeInTheDocument();
  });
});
