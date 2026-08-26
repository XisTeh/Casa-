import type { ShoppingCategory, ShoppingUnit } from './shopping-list';

export type Category = {
  id: string;
  houseId: string;
  name: string;
  normalizedName: string;
  legacyKey?: ShoppingCategory;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  houseId: string;
  name: string;
  normalizedName: string;
  brand: string;
  categoryId: string;
  defaultQuantity?: number;
  defaultUnit: ShoppingUnit;
  notes: string;
  favorite: boolean;
  /** Configuração manual pertencente à Casa. Ausente em registros anteriores à migração v5. */
  isRecurring?: boolean;
  recurrenceDays?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewProduct = Pick<
  Product,
  | 'name'
  | 'brand'
  | 'categoryId'
  | 'defaultQuantity'
  | 'defaultUnit'
  | 'notes'
  | 'favorite'
  | 'isRecurring'
  | 'recurrenceDays'
>;

export type ProductUpdate = Partial<NewProduct>;

export type NewCategory = Pick<Category, 'name'>;

export type ProductLastPurchase = {
  unitPriceCents: number;
  storeId?: string;
  storeName: string;
  purchasedAt: string;
};

export type ProductWithLastPurchase = Product & {
  lastPurchase?: ProductLastPurchase;
};

export type DefaultCategoryDefinition = {
  name: string;
  legacyKey: ShoppingCategory;
};

export const DEFAULT_CATEGORY_DEFINITIONS: ReadonlyArray<DefaultCategoryDefinition> = [
  { name: 'Mercearia', legacyKey: 'mercearia' },
  { name: 'Hortifruti', legacyKey: 'hortifruti' },
  { name: 'Laticínios', legacyKey: 'laticinios' },
  { name: 'Limpeza', legacyKey: 'limpeza' },
  { name: 'Higiene', legacyKey: 'higiene' },
  { name: 'Bebidas', legacyKey: 'bebidas' },
  { name: 'Padaria', legacyKey: 'padaria' },
  { name: 'Açougue', legacyKey: 'acougue' },
  { name: 'Congelados', legacyKey: 'congelados' },
  { name: 'Pet', legacyKey: 'pet' },
  { name: 'Outros', legacyKey: 'outros' },
];

export function resolveCategoryByLegacyKey(
  categories: ReadonlyArray<Category>,
  legacyKey: ShoppingCategory,
) {
  return categories.find((category) => category.legacyKey === legacyKey);
}

export function resolveShoppingCategory(
  categories: ReadonlyArray<Category>,
  legacyKey?: ShoppingCategory,
) {
  return (
    (legacyKey ? resolveCategoryByLegacyKey(categories, legacyKey) : undefined) ??
    resolveCategoryByLegacyKey(categories, 'outros')
  );
}

export function normalizeCatalogName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}
