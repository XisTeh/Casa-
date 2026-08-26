import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CategoryService } from '../application/category-service';
import { ShoppingListFormDialog } from '../features/shopping-list/ShoppingListFormDialog';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';

describe('ShoppingListFormDialog', () => {
  it('recebe as 11 categorias de uma Casa online nova e envia a categoria semântica', async () => {
    const database = new CasaeLocalDatabase(`shopping-dialog-${Date.now()}-${Math.random()}`, {
      migrateLegacy: false,
    });
    const repository = new LocalCategoryRepository(database);
    const service = new CategoryService(repository, new LocalProductRepository(database));
    const houseId = '3ee44cfe-40cb-40cb-a087-e0000148e6ae';
    const categories = await service.ensureDefaultCategoriesForHouse(houseId);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ShoppingListFormDialog categories={categories} onClose={vi.fn()} onSubmit={onSubmit} />,
    );

    const categorySelect = screen.getByRole('combobox', { name: /categoria/i });
    expect(categorySelect).toHaveDisplayValue('Mercearia');
    expect(within(categorySelect).getAllByRole('option')).toHaveLength(11);
    await user.type(screen.getByRole('textbox', { name: /produto/i }), 'Arroz');
    await user.click(screen.getByRole('button', { name: /adicionar à lista/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: 'Arroz',
        category: 'mercearia',
        categoryName: 'Mercearia',
      }),
    );
  });
});
