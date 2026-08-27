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
import { isPurchaseSyncRepository } from '../domain/purchase-sync';
import type { ShoppingSyncStatus } from '../domain/shopping-list';
import type { ShoppingListService } from './shopping-list-service';

function createId(prefix = 'purchase') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class PurchaseService {
  constructor(
    private readonly repository: PurchaseRepository,
    private readonly products?: ProductService,
    private readonly currentUserId?: string,
    private readonly shoppingList?: ShoppingListService,
  ) {}

  subscribe(
    houseId: string,
    onChanged: () => void,
    onStatusChanged?: (status: ShoppingSyncStatus) => void,
  ) {
    return isPurchaseSyncRepository(this.repository)
      ? this.repository.subscribe(houseId, onChanged, onStatusChanged)
      : () => undefined;
  }

  async syncNow(houseId: string) {
    if (isPurchaseSyncRepository(this.repository)) await this.repository.syncNow(houseId);
  }

  async listActiveSessions(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.listActiveSessions(houseId);
  }

  async getSession(sessionId: string, houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.getSession(houseId, sessionId);
  }

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
    startAnother = false,
  ) {
    const normalizedStoreName = store.name.trim();

    if (!normalizedStoreName) {
      throw new Error('Informe o mercado ou estabelecimento.');
    }

    await this.repository.initialize();
    const existingSession = (await this.repository.listActiveSessions(actor.houseId)).find(
      (session) => session.purchasedById === actor.memberId,
    );

    if (existingSession && !startAnother) {
      return existingSession;
    }

    const session: PersistedPurchaseSession = {
      id: createId(),
      syncId: undefined,
      houseId: actor.houseId,
      storeId: store.id,
      storeNameSnapshot: normalizedStoreName,
      entryMode,
      status: 'active',
      startedAt: new Date().toISOString(),
      purchasedById: actor.memberId,
      purchasedByNameSnapshot: actor.memberName,
      totalPriceCents: 0,
      updatedAt: new Date().toISOString(),
    };

    return this.repository.createSession(session);
  }

  async markPurchased(
    shoppingItem: ShoppingListItem,
    purchasedQuantity: number,
    unitPriceCents: number,
    houseId = HOUSE_ID,
    sessionId?: string,
  ) {
    if (!Number.isFinite(purchasedQuantity) || purchasedQuantity <= 0) {
      throw new Error('Informe uma quantidade válida.');
    }

    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new Error('Informe um preço unitário válido.');
    }

    const session = await this.requireActiveSession(houseId, sessionId);
    const existingItem = session.items.find(
      (item) => item.sourceShoppingItemId === shoppingItem.id,
    );

    if (existingItem) {
      return session;
    }

    const purchasedAt = new Date().toISOString();
    const purchaseItem: PurchaseItem = {
      id: createId('purchase-item'),
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
      createdAt: purchasedAt,
      updatedAt: purchasedAt,
    };

    return this.repository.savePurchasedItem(houseId, purchaseItem);
  }

  async undoPurchasedItem(sourceShoppingItemId: string, houseId = HOUSE_ID, sessionId?: string) {
    const session = await this.requireActiveSession(houseId, sessionId);
    const item = session.items.find(
      (candidate) => candidate.sourceShoppingItemId === sourceShoppingItemId,
    );
    return item ? this.repository.removePurchasedItem(houseId, session.id, item.id) : session;
  }

  async addManualItem(input: ManualPurchaseItemInput, houseId = HOUSE_ID, sessionId?: string) {
    this.validateManualInput(input);
    const session = await this.requireActiveSession(houseId, sessionId);
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
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.savePurchasedItem(houseId, purchaseItem);
  }

  async updateManualItem(
    itemId: string,
    input: ManualPurchaseItemInput,
    houseId = HOUSE_ID,
    sessionId?: string,
  ) {
    this.validateManualInput(input);
    const session = await this.requireActiveSession(houseId, sessionId);
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
      updatedAt: new Date().toISOString(),
    };
    return this.repository.savePurchasedItem(houseId, updatedItem);
  }

  async removePurchaseItem(itemId: string, houseId = HOUSE_ID, sessionId?: string) {
    const session = await this.requireActiveSession(houseId, sessionId);
    const item = session.items.find((candidate) => candidate.id === itemId);
    if (!item) return session;
    return this.repository.removePurchasedItem(houseId, session.id, item.id);
  }

  async cancelPurchase(houseId = HOUSE_ID, sessionId?: string) {
    const session = await this.requireActiveSession(houseId, sessionId);
    return this.repository.cancelSession(houseId, session.id, new Date().toISOString());
  }

  async completePurchase(houseId = HOUSE_ID, sessionId?: string) {
    const session = await this.requireActiveSession(houseId, sessionId);

    if (session.items.length === 0) {
      throw new Error('Marque pelo menos um produto antes de finalizar.');
    }

    const purchasedShoppingItemIds = session.items
      .filter(isShoppingListPurchaseItem)
      .map((item) => item.sourceShoppingItemId)
      .filter((id): id is string => Boolean(id));
    if (this.shoppingList) {
      await this.shoppingList.removeMany(purchasedShoppingItemIds, houseId);
    }
    const completedSession = await this.repository.completeSession(
      houseId,
      session.id,
      new Date().toISOString(),
      getPurchaseSubtotal(session.items),
      purchasedShoppingItemIds,
    );

    return completedSession;
  }

  private async requireActiveSession(houseId: string, sessionId?: string) {
    await this.repository.initialize();
    const session = sessionId
      ? await this.repository.getSession(houseId, sessionId)
      : await this.repository.getActiveSession(houseId);

    if (!session || session.status !== 'active') {
      throw new Error('Não existe uma compra ativa.');
    }

    if (
      this.currentUserId &&
      session.purchasedById &&
      session.purchasedById !== this.currentUserId
    ) {
      throw new Error('Somente quem iniciou pode alterar esta compra.');
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
