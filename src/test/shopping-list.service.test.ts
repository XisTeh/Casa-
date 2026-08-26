import { describe, expect, it } from 'vitest';
import {
  filterShoppingListItems,
  groupShoppingListItems,
} from '../application/shopping-list-selectors';
import { ShoppingListService } from '../application/shopping-list-service';
import { HOUSE_ID, getShoppingListSummary } from '../domain/shopping-list';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';

function databaseName(label: string) {
  return `casae-test-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createEmptyService(label: string) {
  const repository = new LocalShoppingRepository(databaseName(label));
  await repository.initialize();
  const seededItems = await repository.list(HOUSE_ID);
  await Promise.all(seededItems.map((item) => repository.remove(HOUSE_ID, item.id)));
  return new ShoppingListService(repository);
}

describe('ShoppingListService', () => {
  it('cria, edita e exclui um item mantendo os dados locais consistentes', async () => {
    const service = await createEmptyService('crud');
    const created = await service.create({
      productName: '  Sabão em pó  ',
      quantity: 2,
      unit: 'caixa',
      category: 'limpeza',
      preferredBrand: '  OMO ',
      notes: ' Para roupas brancas ',
      priority: 'normal',
    });

    expect(created.productName).toBe('Sabão em pó');
    expect(created.preferredBrand).toBe('OMO');

    const updated = await service.update(created.id, { quantity: 3, priority: 'high' });
    expect(updated).toMatchObject({ productName: 'Sabão em pó', quantity: 3, priority: 'high' });

    await service.remove(created.id);
    expect(await service.list()).toEqual([]);
  });

  it('filtra por nome, marca, categoria e prioridade e agrupa por categoria', async () => {
    const service = await createEmptyService('filters');
    const rice = await service.create({
      productName: 'Arroz integral',
      quantity: 1,
      unit: 'pacote',
      category: 'mercearia',
      preferredBrand: 'Tio João',
      notes: '',
      priority: 'high',
    });
    await service.create({
      productName: 'Detergente',
      quantity: 2,
      unit: 'unidade',
      category: 'limpeza',
      preferredBrand: 'Ypê',
      notes: '',
      priority: 'normal',
    });
    const items = await service.list();

    expect(
      filterShoppingListItems(items, { query: 'joao', priority: 'all', category: 'all' }),
    ).toEqual([rice]);
    expect(
      filterShoppingListItems(items, { query: 'limpeza', priority: 'all', category: 'all' }),
    ).toHaveLength(1);
    expect(
      filterShoppingListItems(items, { query: '', priority: 'high', category: 'all' }),
    ).toEqual([rice]);
    expect(groupShoppingListItems(items).map((group) => group.category)).toEqual([
      'mercearia',
      'limpeza',
    ]);
  });

  it('calcula os números pendentes e prioritários usados pelo Dashboard', async () => {
    const service = await createEmptyService('summary');
    await service.create({
      productName: 'Leite',
      quantity: 2,
      unit: 'litro',
      category: 'laticinios',
      preferredBrand: '',
      notes: '',
      priority: 'high',
    });
    await service.create({
      productName: 'Pão',
      quantity: 1,
      unit: 'pacote',
      category: 'padaria',
      preferredBrand: '',
      notes: '',
      priority: 'normal',
    });

    expect(getShoppingListSummary(await service.list())).toEqual({
      pendingItems: 2,
      priorityItems: 1,
    });
  });
});
