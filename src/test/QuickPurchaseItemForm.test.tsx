import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KnownProduct } from '../application/known-product-selectors';
import { QuickPurchaseItemForm } from '../features/purchase/QuickPurchaseItemForm';

const banana: KnownProduct = {
  identity: 'product-banana',
  productId: 'product-banana',
  name: 'Banana prata',
  brand: '',
  category: 'hortifruti',
  unit: 'kg',
  defaultQuantity: 1,
  lastPriceCents: 498,
  lastStoreName: 'Ultra box',
};

function renderForm() {
  const onCreate = vi.fn(async () => undefined);
  render(
    <QuickPurchaseItemForm
      editingItem={null}
      knownProducts={[banana]}
      onCancelEdit={vi.fn()}
      onCreate={onCreate}
      onUpdate={vi.fn(async () => undefined)}
    />,
  );
  return { onCreate };
}

describe('QuickPurchaseItemForm autocomplete', () => {
  it('seleciona no pointerdown antes do blur, confirma o produto e fecha a lista', async () => {
    const user = userEvent.setup();
    const { onCreate } = renderForm();
    const product = screen.getByRole('combobox', { name: 'Produto' });

    await user.type(product, 'banana');
    expect(product).toHaveAttribute('aria-expanded', 'true');
    const option = screen.getByRole('option', { name: /Banana prata/i });
    fireEvent.pointerDown(option, { pointerType: 'touch' });

    expect(product).toHaveValue('Banana prata');
    expect(product).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();

    await user.click(product);
    expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();
    await user.click(screen.getByLabelText('Quantidade do item rápido'));
    expect(screen.getByLabelText('Quantidade do item rápido')).toHaveFocus();

    await user.type(screen.getByLabelText('Preço unitário do item rápido'), '4,98');
    await user.click(screen.getByRole('button', { name: 'Adicionar e continuar' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ productId: 'product-banana' }));
  });

  it('fecha ao tocar fora ou pressionar Escape e reabre somente depois de editar', async () => {
    const user = userEvent.setup();
    renderForm();
    const product = screen.getByRole('combobox', { name: 'Produto' });

    await user.type(product, 'banana');
    expect(screen.getByRole('listbox', { name: 'Sugestões de produtos' })).toBeVisible();
    fireEvent.pointerDown(document.querySelector('.quick-purchase-form__header')!, {
      pointerType: 'touch',
    });
    expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();

    await user.type(product, ' ');
    expect(screen.getByRole('listbox', { name: 'Sugestões de produtos' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();

    await user.clear(product);
    expect(product).toHaveAttribute('aria-expanded', 'false');
    await user.type(product, 'banana');
    expect(screen.getByRole('listbox', { name: 'Sugestões de produtos' })).toBeVisible();
  });

  it.each(['Quantidade do item rápido', 'Unidade do item rápido', 'Preço unitário do item rápido'])(
    'fecha no toque em %s e transfere o foco normalmente',
    async (fieldLabel) => {
      const user = userEvent.setup();
      renderForm();
      const product = screen.getByRole('combobox', { name: 'Produto' });
      const field = screen.getByLabelText(fieldLabel);

      await user.type(product, 'banana');
      expect(screen.getByRole('listbox', { name: 'Sugestões de produtos' })).toBeVisible();
      fireEvent.pointerDown(field, { pointerType: 'touch' });
      act(() => field.focus());

      expect(field).toHaveFocus();
      expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();
    },
  );

  it('seleciona a sugestão ativa com Enter e fecha imediatamente', async () => {
    const user = userEvent.setup();
    renderForm();
    const product = screen.getByRole('combobox', { name: 'Produto' });

    await user.type(product, 'banana');
    await user.keyboard('{Enter}');

    expect(product).toHaveValue('Banana prata');
    expect(product).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Sugestões de produtos' })).toBeNull();
  });
});
