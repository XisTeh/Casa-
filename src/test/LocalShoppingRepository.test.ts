import { describe, expect, it } from 'vitest';
import { HOUSE_ID, type ShoppingListItem } from '../domain/shopping-list';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function databaseName(label: string) {
  return `casae-test-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeItem(id: string): ShoppingListItem {
  return {
    id,
    houseId: HOUSE_ID,
    productName: 'Açúcar',
    quantity: 1,
    unit: 'pacote',
    category: 'mercearia',
    preferredBrand: '',
    notes: '',
    priority: 'normal',
    status: 'pending',
    addedBy: 'Raabe',
    createdAt: '2026-08-25T13:00:00.000Z',
    updatedAt: '2026-08-25T13:00:00.000Z',
  };
}

describe('LocalShoppingRepository', () => {
  it('persiste itens entre instâncias do repositório', async () => {
    const name = databaseName('persistence');
    const firstRepository = new LocalShoppingRepository(name);
    await firstRepository.initialize();
    await firstRepository.create(makeItem('custom-sugar'));

    const restoredRepository = new LocalShoppingRepository(name);
    await restoredRepository.initialize();
    const restoredItems = await restoredRepository.list(HOUSE_ID);

    expect(restoredItems.some((item) => item.id === 'custom-sugar')).toBe(true);
  });

  it('mantém uma instalação nova vazia inclusive após reabrir o banco', async () => {
    const name = databaseName('clean-install');
    const firstRepository = new LocalShoppingRepository(name);
    await firstRepository.initialize();
    expect(await firstRepository.list(HOUSE_ID)).toEqual([]);

    const restoredRepository = new LocalShoppingRepository(name);
    await restoredRepository.initialize();

    expect(await restoredRepository.list(HOUSE_ID)).toEqual([]);
  });
});
