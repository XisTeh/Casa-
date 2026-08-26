export const HOUSE_ID = 'house-raabe-sidney';
export const DEMO_USER_NAME = 'Raabe';

export const SHOPPING_CATEGORIES = [
  'mercearia',
  'hortifruti',
  'acougue',
  'padaria',
  'bebidas',
  'laticinios',
  'congelados',
  'limpeza',
  'higiene',
  'pet',
  'outros',
] as const;

export const SHOPPING_UNITS = [
  'unidade',
  'pacote',
  'caixa',
  'kg',
  'g',
  'litro',
  'ml',
  'garrafa',
  'lata',
  'dúzia',
] as const;

export const SHOPPING_PRIORITIES = ['low', 'normal', 'high'] as const;
export const SHOPPING_ITEM_STATUSES = ['pending', 'purchased'] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];
export type ShoppingUnit = (typeof SHOPPING_UNITS)[number];
export type ShoppingPriority = (typeof SHOPPING_PRIORITIES)[number];
export type ShoppingItemStatus = (typeof SHOPPING_ITEM_STATUSES)[number];

export type ShoppingListItem = {
  id: string;
  houseId: string;
  productName: string;
  quantity: number;
  unit: ShoppingUnit;
  category: ShoppingCategory;
  preferredBrand: string;
  notes: string;
  priority: ShoppingPriority;
  status: ShoppingItemStatus;
  addedBy: string;
  addedByMemberId?: string;
  addedByNameSnapshot?: string;
  createdAt: string;
  updatedAt: string;
  productId?: string;
  categoryId?: string;
  categoryName?: string;
  /** Compatibilidade com dados criados antes do catálogo central. */
  houseProductId?: string;
  barcode?: string;
  /** Tombstone local/remoto. Itens excluídos continuam persistidos para sincronização. */
  deletedAt?: string;
  /** Identidade da última pessoa que alterou o registro no modo online. */
  updatedByMemberId?: string;
};

export type ShoppingSyncOperation = 'upsert' | 'delete';

export type ShoppingSyncOutboxEntry = {
  id: string;
  entityType: 'shopping-item';
  entityId: string;
  houseId: string;
  actorId: string;
  operation: ShoppingSyncOperation;
  payload: ShoppingListItem;
  version: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  nextAttemptAt?: string;
};

export type ShoppingSyncStatus = {
  state: 'local' | 'offline' | 'syncing' | 'synced' | 'pending' | 'error';
  pending: number;
};

export type LegacyShoppingMigration = {
  count: number;
  importIntoHouse(): Promise<void>;
};

export type NewShoppingListItem = Pick<
  ShoppingListItem,
  'productName' | 'quantity' | 'unit' | 'category' | 'preferredBrand' | 'notes' | 'priority'
> & {
  productId?: string;
  categoryId?: string;
  categoryName?: string;
  houseProductId?: string;
  barcode?: string;
};

export type ShoppingListItemUpdate = Partial<NewShoppingListItem>;

export type ShoppingListSummary = {
  pendingItems: number;
  priorityItems: number;
};

export const shoppingCategoryLabels: Record<ShoppingCategory, string> = {
  mercearia: 'Mercearia',
  hortifruti: 'Hortifruti',
  acougue: 'Açougue',
  padaria: 'Padaria',
  bebidas: 'Bebidas',
  laticinios: 'Laticínios',
  congelados: 'Congelados',
  limpeza: 'Limpeza',
  higiene: 'Higiene',
  pet: 'Pet',
  outros: 'Outros',
};

export const shoppingPriorityLabels: Record<ShoppingPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
};

export function getShoppingListSummary(items: ShoppingListItem[]): ShoppingListSummary {
  const pendingItems = items.filter((item) => item.status === 'pending');

  return {
    pendingItems: pendingItems.length,
    priorityItems: pendingItems.filter((item) => item.priority === 'high').length,
  };
}

export const initialShoppingListSeed: ShoppingListItem[] = [
  {
    id: 'seed-arroz',
    houseId: HOUSE_ID,
    productName: 'Arroz',
    quantity: 2,
    unit: 'pacote',
    category: 'mercearia',
    preferredBrand: 'Tio João',
    notes: '',
    priority: 'high',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:00:00.000Z',
    updatedAt: '2026-08-25T12:00:00.000Z',
  },
  {
    id: 'seed-feijao',
    houseId: HOUSE_ID,
    productName: 'Feijão carioca',
    quantity: 1,
    unit: 'pacote',
    category: 'mercearia',
    preferredBrand: '',
    notes: '',
    priority: 'normal',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:01:00.000Z',
    updatedAt: '2026-08-25T12:01:00.000Z',
  },
  {
    id: 'seed-banana',
    houseId: HOUSE_ID,
    productName: 'Banana prata',
    quantity: 1,
    unit: 'kg',
    category: 'hortifruti',
    preferredBrand: '',
    notes: 'Escolher maduras para a semana.',
    priority: 'normal',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:02:00.000Z',
    updatedAt: '2026-08-25T12:02:00.000Z',
  },
  {
    id: 'seed-leite',
    houseId: HOUSE_ID,
    productName: 'Leite integral',
    quantity: 2,
    unit: 'litro',
    category: 'laticinios',
    preferredBrand: '',
    notes: '',
    priority: 'high',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:03:00.000Z',
    updatedAt: '2026-08-25T12:03:00.000Z',
  },
  {
    id: 'seed-detergente',
    houseId: HOUSE_ID,
    productName: 'Detergente neutro',
    quantity: 3,
    unit: 'unidade',
    category: 'limpeza',
    preferredBrand: '',
    notes: '',
    priority: 'normal',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:04:00.000Z',
    updatedAt: '2026-08-25T12:04:00.000Z',
  },
  {
    id: 'seed-papel-higienico',
    houseId: HOUSE_ID,
    productName: 'Papel higiênico',
    quantity: 12,
    unit: 'unidade',
    category: 'higiene',
    preferredBrand: '',
    notes: 'Folha dupla.',
    priority: 'high',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:05:00.000Z',
    updatedAt: '2026-08-25T12:05:00.000Z',
  },
  {
    id: 'seed-cafe',
    houseId: HOUSE_ID,
    productName: 'Café',
    quantity: 1,
    unit: 'pacote',
    category: 'mercearia',
    preferredBrand: '',
    notes: '',
    priority: 'normal',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:06:00.000Z',
    updatedAt: '2026-08-25T12:06:00.000Z',
  },
  {
    id: 'seed-racao',
    houseId: HOUSE_ID,
    productName: 'Ração',
    quantity: 1,
    unit: 'pacote',
    category: 'pet',
    preferredBrand: '',
    notes: '',
    priority: 'low',
    status: 'pending',
    addedBy: DEMO_USER_NAME,
    createdAt: '2026-08-25T12:07:00.000Z',
    updatedAt: '2026-08-25T12:07:00.000Z',
  },
];
