import { calculateItemTotalCents } from './locale-formatters';
import {
  getPurchaseSubtotal,
  isShoppingListPurchaseItem,
  type ManualPurchaseItemInput,
  type PurchaseEntryMode,
  type PersistedPurchaseSession,
  type PurchaseItem,
} from '../domain/purchase';
import type { PurchaseRepository } from '../domain/purchase-repository';
import {
  DEMO_USER_NAME,
  HOUSE_ID,
  shoppingCategoryLabels,
  type ShoppingListItem,
} from '../domain/shopping-list';
import type { ActiveHousehold } from '../domain/house';
import type { Store } from '../domain/store';
import { getShoppingListProductId, normalizeProductName } from './known-product-selectors';
import type { ProductService } from './product-service';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class PurchaseService {
  constructor(
    private readonly repository: PurchaseRepository,
    private readonly products?: ProductService,
  ) {}

  async getActiveSession(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.getActiveSession(houseId);
  }

  async listCompletedSessions(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.listCompletedSessions(houseId);
  }

  async startPurchase(
    store: Pick<Store, 'id' | 'name'>,
    entryMode: PurchaseEntryMode = 'list',
    actor: ActiveHousehold = {
      houseId: HOUSE_ID,
      memberId: 'member-raabe-legacy',
      memberName: DEMO_USER_NAME,
    },
  ) {
    const normalizedStoreName = store.name.trim();

    if (!normalizedStoreName) {
      throw new Error('Informe o mercado ou estabelecimento.');
    }

    await this.repository.initialize();
    const existingSession = await this.repository.getActiveSession(actor.houseId);

    if (existingSession) {
      return existingSession;
    }

    const session: PersistedPurchaseSession = {
      id: createId('purchase'),
      houseId: actor.houseId,
      storeId: store.id,
      storeNameSnapshot: normalizedStoreName,
      entryMode,
      status: 'active',
      startedAt: new Date().toISOString(),
      purchasedById: actor.memberId,
      purchasedByNameSnapshot: actor.memberName,
      totalPriceCents: 0,
    };

    return this.repository.createSession(session);
  }

  async markPurchased(
    shoppingItem: ShoppingListItem,
    purchasedQuantity: number,
    unitPriceCents: number,
    houseId = HOUSE_ID,
  ) {
    if (!Number.isFinite(purchasedQuantity) || purchasedQuantity <= 0) {
      throw new Error('Informe uma quantidade válida.');
    }

    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new Error('Informe um preço unitário válido.');
    }

    const session = await this.requireActiveSession(houseId);
    const existingItem = session.items.find(
      (item) => item.sourceShoppingItemId === shoppingItem.id,
    );

    if (existingItem) {
      return session;
    }

    const purchasedAt = new Date().toISOString();
    const purchaseItem: PurchaseItem = {
      id: `${session.id}:${shoppingItem.id}`,
      houseId: session.houseId,
      purchaseSessionId: session.id,
      origin: 'shopping-list',
      sourceShoppingItemId: shoppingItem.id,
      productId: getShoppingListProductId(shoppingItem),
      productNameSnapshot: shoppingItem.productName,
      brandSnapshot: shoppingItem.preferredBrand,
      categorySnapshot: shoppingItem.category,
      categoryNameSnapshot:
        shoppingItem.categoryName ?? shoppingCategoryLabels[shoppingItem.category],
      prioritySnapshot: shoppingItem.priority,
      notesSnapshot: shoppingItem.notes,
      plannedQuantity: shoppingItem.quantity,
      purchasedQuantity,
      unitSnapshot: shoppingItem.unit,
      unitPriceCents,
      totalPriceCents: calculateItemTotalCents(purchasedQuantity, unitPriceCents),
      storeId: session.storeId,
      storeNameSnapshot: session.storeNameSnapshot,
      purchasedById: session.purchasedById,
      purchasedByNameSnapshot: session.purchasedByNameSnapshot,
      purchasedAt,
    };

    return this.repository.savePurchasedItem(houseId, purchaseItem);
  }

  async undoPurchasedItem(sourceShoppingItemId: string, houseId = HOUSE_ID) {
    const session = await this.requireActiveSession(houseId);
    const item = session.items.find(
      (candidate) => candidate.sourceShoppingItemId === sourceShoppingItemId,
    );
    return item ? this.repository.removePurchasedItem(houseId, session.id, item.id) : session;
  }

  async addManualItem(input: ManualPurchaseItemInput, houseId = HOUSE_ID) {
    this.validateManualInput(input);
    const session = await this.requireActiveSession(houseId);
    const catalogProduct = await this.products?.findOrCreateFromPurchase(input, houseId);
    const now = new Date().toISOString();
    const purchaseItem: PurchaseItem = {
      id: createId('purchase-item'),
      houseId: session.houseId,
      purchaseSessionId: session.id,
      origin: 'manual',
      productId: catalogProduct?.id ?? input.productId ?? createId('product'),
      productNameSnapshot: input.productName.trim(),
      brandSnapshot: input.brand?.trim() ?? '',
      categorySnapshot: input.category ?? 'outros',
      categoryNameSnapshot: input.categoryName,
      prioritySnapshot: 'normal',
      notesSnapshot: '',
      plannedQuantity: input.quantity,
      purchasedQuantity: input.quantity,
      unitSnapshot: input.unit,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents: calculateItemTotalCents(input.quantity, input.unitPriceCents),
      storeId: session.storeId,
      storeNameSnapshot: session.storeNameSnapshot,
      purchasedById: session.purchasedById,
      purchasedByNameSnapshot: session.purchasedByNameSnapshot,
      purchasedAt: now,
    };
    return this.repository.savePurchasedItem(houseId, purchaseItem);
  }

  async updateManualItem(itemId: string, input: ManualPurchaseItemInput, houseId = HOUSE_ID) {
    this.validateManualInput(input);
    const session = await this.requireActiveSession(houseId);
    const existingItem = session.items.find((item) => item.id === itemId);
    if (!existingItem || existingItem.origin !== 'manual') {
      throw new Error('Este item não pode ser editado por este formulário.');
    }
    const sameProduct =
      normalizeProductName(existingItem.productNameSnapshot) ===
      normalizeProductName(input.productName);
    const catalogProduct = await this.products?.findOrCreateFromPurchase(input, houseId);
    const updatedItem: PurchaseItem = {
      ...existingItem,
      productId:
        catalogProduct?.id ??
        input.productId ??
        (sameProduct ? existingItem.productId : createId('product')),
      productNameSnapshot: input.productName.trim(),
      brandSnapshot: input.brand?.trim() ?? '',
      categorySnapshot: input.category ?? 'outros',
      categoryNameSnapshot: input.categoryName ?? existingItem.categoryNameSnapshot,
      plannedQuantity: input.quantity,
      purchasedQuantity: input.quantity,
      unitSnapshot: input.unit,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents: calculateItemTotalCents(input.quantity, input.unitPriceCents),
    };
    return this.repository.savePurchasedItem(houseId, updatedItem);
  }

  async removePurchaseItem(itemId: string, houseId = HOUSE_ID) {
    const session = await this.requireActiveSession(houseId);
    const item = session.items.find((candidate) => candidate.id === itemId);
    if (!item) return session;
    return this.repository.removePurchasedItem(houseId, session.id, item.id);
  }

  async cancelPurchase(houseId = HOUSE_ID) {
    const session = await this.requireActiveSession(houseId);
    await this.repository.cancelSession(houseId, session.id);
  }

  async completePurchase(houseId = HOUSE_ID) {
    const session = await this.requireActiveSession(houseId);

    if (session.items.length === 0) {
      throw new Error('Marque pelo menos um produto antes de finalizar.');
    }

    const completedSession = await this.repository.completeSession(
      houseId,
      session.id,
      new Date().toISOString(),
      getPurchaseSubtotal(session.items),
      session.items
        .filter(isShoppingListPurchaseItem)
        .map((item) => item.sourceShoppingItemId)
        .filter((id): id is string => Boolean(id)),
    );

    return completedSession;
  }

  private async requireActiveSession(houseId: string) {
    await this.repository.initialize();
    const session = await this.repository.getActiveSession(houseId);

    if (!session) {
      throw new Error('Não existe uma compra ativa.');
    }

    return session;
  }

  private validateManualInput(input: ManualPurchaseItemInput) {
    if (!input.productName.trim()) throw new Error('Informe o nome do produto.');
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error('Informe uma quantidade válida.');
    }
    if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0) {
      throw new Error('Informe um preço unitário válido.');
    }
  }
}
