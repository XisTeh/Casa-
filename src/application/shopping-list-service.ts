import {
  DEMO_USER_NAME,
  HOUSE_ID,
  type NewShoppingListItem,
  type ShoppingListItem,
  type ShoppingListItemUpdate,
} from '../domain/shopping-list';
import type { ActiveHousehold } from '../domain/house';
import type { ShoppingListRepository } from '../domain/shopping-list-repository';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateInput(input: NewShoppingListItem | ShoppingListItemUpdate) {
  if ('productName' in input && input.productName !== undefined && !input.productName.trim()) {
    throw new Error('Informe o nome do produto.');
  }

  if (
    'quantity' in input &&
    input.quantity !== undefined &&
    (!Number.isFinite(input.quantity) || input.quantity <= 0)
  ) {
    throw new Error('Informe uma quantidade válida.');
  }
}

function normalizeInput(input: NewShoppingListItem): NewShoppingListItem {
  return {
    ...input,
    productName: input.productName.trim(),
    preferredBrand: input.preferredBrand.trim(),
    notes: input.notes.trim(),
  };
}

function normalizeUpdate(input: ShoppingListItemUpdate): ShoppingListItemUpdate {
  const normalized = { ...input };

  if (input.productName !== undefined) {
    normalized.productName = input.productName.trim();
  }

  if (input.preferredBrand !== undefined) {
    normalized.preferredBrand = input.preferredBrand.trim();
  }

  if (input.notes !== undefined) {
    normalized.notes = input.notes.trim();
  }

  return normalized;
}

export class ShoppingListService {
  constructor(private readonly repository: ShoppingListRepository) {}

  async list(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.list(houseId);
  }

  async create(
    input: NewShoppingListItem,
    actor: ActiveHousehold = {
      houseId: HOUSE_ID,
      memberId: 'member-raabe-legacy',
      memberName: DEMO_USER_NAME,
    },
  ) {
    validateInput(input);
    const normalizedInput = normalizeInput(input);
    const now = new Date().toISOString();
    const item: ShoppingListItem = {
      id: createId(),
      houseId: actor.houseId,
      addedBy: actor.memberName,
      addedByMemberId: actor.memberId,
      addedByNameSnapshot: actor.memberName,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...normalizedInput,
    };

    await this.repository.initialize();
    return this.repository.create(item);
  }

  async update(id: string, changes: ShoppingListItemUpdate, houseId = HOUSE_ID) {
    validateInput(changes);
    await this.repository.initialize();
    return this.repository.update(houseId, id, normalizeUpdate(changes));
  }

  async remove(id: string, houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.remove(houseId, id);
  }

  async removeMany(ids: string[], houseId = HOUSE_ID) {
    await this.repository.initialize();
    await Promise.all([...new Set(ids)].map((id) => this.repository.remove(houseId, id)));
  }
}
