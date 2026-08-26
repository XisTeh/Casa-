import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShoppingListService } from '../application/shopping-list-service';
import { App } from '../app/App';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function createService() {
  return new ShoppingListService(
    new LocalShoppingRepository(
      `casae-test-page-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  );
}

describe('ShoppingListPage', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/lista');
  });

  it('permite adicionar, editar e remover um produto pela interface', async () => {
    const user = userEvent.setup();
    render(<App shoppingListService={createService()} />);

    await screen.findByRole('heading', { name: 'Lista de compras' });
    await user.click(screen.getByRole('button', { name: /adicionar produto/i }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/produto/i), 'Sabão em pó');
    const categorySelect = within(dialog).getByLabelText(/categoria/i);
    await user.selectOptions(
      categorySelect,
      within(categorySelect).getByRole('option', { name: 'Limpeza' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar à lista' }));

    expect(await screen.findByRole('heading', { name: 'Sabão em pó' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar Sabão em pó' }));
    const editDialog = screen.getByRole('dialog');
    const productInput = within(editDialog).getByLabelText(/produto/i);
    await user.clear(productInput);
    await user.type(productInput, 'Sabão líquido');
    await user.click(within(editDialog).getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('heading', { name: 'Sabão líquido' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover Sabão líquido' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));

    expect(screen.queryByRole('heading', { name: 'Sabão líquido' })).not.toBeInTheDocument();
  });
});
