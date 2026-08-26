import type {
  PersistedPurchaseSession,
  PurchaseItem,
  PurchaseSession,
} from '../../domain/purchase';
import type { PurchaseRepository } from '../../domain/purchase-repository';
import {
  CASAE_STORES,
  CasaeLocalDatabase,
  requestToPromise,
  transactionToPromise,
} from '../local-database/CasaeLocalDatabase';

function cloneItem(item: PurchaseItem): PurchaseItem {
  return {
    ...item,
    origin: item.origin ?? (item.sourceShoppingItemId ? 'shopping-list' : 'manual'),
  };
}

function cloneSession(session: PersistedPurchaseSession, items: PurchaseItem[]): PurchaseSession {
  return { ...session, items: items.map(cloneItem) };
}

export class LocalPurchaseRepository implements PurchaseRepository {
  readonly database: CasaeLocalDatabase;

  constructor(database: CasaeLocalDatabase | string = new CasaeLocalDatabase()) {
    this.database =
      typeof database === 'string'
        ? new CasaeLocalDatabase(database, { migrateLegacy: false })
        : database;
  }

  initialize() {
    return this.database.initialize();
  }

  async getActiveSession(houseId: string): Promise<PurchaseSession | null> {
    await this.initialize();
    const sessions = await this.listSessionsForHouse(houseId);
    const activeSession = sessions
      .filter((session) => session.status === 'active')
      .sort((first, second) => second.startedAt.localeCompare(first.startedAt))[0];
    return activeSession ? this.hydrateSession(activeSession) : null;
  }

  async createSession(session: PersistedPurchaseSession): Promise<PurchaseSession> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      this.database.getMemoryDatabase().purchaseSessions.set(session.id, { ...session });
      return cloneSession(session, []);
    }

    const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseSessions, 'readwrite');
    transaction.objectStore(CASAE_STORES.purchaseSessions).add(session);
    await transactionToPromise(transaction);
    return cloneSession(session, []);
  }

  async savePurchasedItem(houseId: string, item: PurchaseItem): Promise<PurchaseSession> {
    const session = await this.getSession(item.purchaseSessionId);
    if (
      !session ||
      session.houseId !== houseId ||
      item.houseId !== houseId ||
      session.status !== 'active'
    )
      throw new Error('Esta compra não está mais ativa.');
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      this.database.getMemoryDatabase().purchaseItems.set(item.id, cloneItem(item));
    } else {
      const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseItems, 'readwrite');
      transaction.objectStore(CASAE_STORES.purchaseItems).put(item);
      await transactionToPromise(transaction);
    }
    return this.hydrateSession(session);
  }

  async removePurchasedItem(
    houseId: string,
    sessionId: string,
    purchaseItemId: string,
  ): Promise<PurchaseSession> {
    const session = await this.getSession(sessionId);
    if (!session || session.houseId !== houseId || session.status !== 'active')
      throw new Error('Esta compra não está mais ativa.');
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      const item = this.database.getMemoryDatabase().purchaseItems.get(purchaseItemId);
      if (item?.houseId === houseId && item.purchaseSessionId === sessionId) {
        this.database.getMemoryDatabase().purchaseItems.delete(purchaseItemId);
      }
    } else {
      const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseItems, 'readwrite');
      const store = transaction.objectStore(CASAE_STORES.purchaseItems);
      const item = await requestToPromise(
        store.get(purchaseItemId) as IDBRequest<PurchaseItem | undefined>,
      );
      if (item?.houseId === houseId && item.purchaseSessionId === sessionId)
        store.delete(purchaseItemId);
      await transactionToPromise(transaction);
    }
    return this.hydrateSession(session);
  }

  async completeSession(
    houseId: string,
    sessionId: string,
    completedAt: string,
    totalPriceCents: number,
    purchasedShoppingItemIds: string[],
  ): Promise<PurchaseSession> {
    const session = await this.getSession(sessionId);
    if (!session || session.houseId !== houseId || session.status !== 'active')
      throw new Error('Esta compra não está mais ativa.');
    const completedSession: PersistedPurchaseSession = {
      ...session,
      status: 'completed',
      completedAt,
      totalPriceCents,
    };
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      const memory = this.database.getMemoryDatabase();
      memory.purchaseSessions.set(sessionId, completedSession);
      purchasedShoppingItemIds.forEach((id) => {
        if (memory.shoppingItems.get(id)?.houseId === houseId) memory.shoppingItems.delete(id);
      });
    } else {
      const transaction = nativeDatabase.transaction(
        [CASAE_STORES.purchaseSessions, CASAE_STORES.purchaseItems, CASAE_STORES.shoppingItems],
        'readwrite',
      );
      transaction.objectStore(CASAE_STORES.purchaseSessions).put(completedSession);
      const shoppingItems = transaction.objectStore(CASAE_STORES.shoppingItems);
      const itemsToDelete = await Promise.all(
        purchasedShoppingItemIds.map((id) =>
          requestToPromise(
            shoppingItems.get(id) as IDBRequest<
              import('../../domain/shopping-list').ShoppingListItem | undefined
            >,
          ),
        ),
      );
      itemsToDelete.forEach((item) => {
        if (item?.houseId === houseId) shoppingItems.delete(item.id);
      });
      await transactionToPromise(transaction);
    }

    return this.hydrateSession(completedSession);
  }

  async cancelSession(houseId: string, sessionId: string): Promise<void> {
    await this.initialize();
    const session = await this.getSession(sessionId);
    if (!session || session.houseId !== houseId)
      throw new Error('Esta compra não está mais ativa.');
    const nativeDatabase = await this.database.getNativeDatabase();

    if (!nativeDatabase) {
      const memory = this.database.getMemoryDatabase();
      memory.purchaseSessions.delete(sessionId);
      [...memory.purchaseItems.values()]
        .filter((item) => item.houseId === houseId && item.purchaseSessionId === sessionId)
        .forEach((item) => memory.purchaseItems.delete(item.id));
      return;
    }

    const transaction = nativeDatabase.transaction(
      [CASAE_STORES.purchaseSessions, CASAE_STORES.purchaseItems],
      'readwrite',
    );
    transaction.objectStore(CASAE_STORES.purchaseSessions).delete(sessionId);
    const itemsStore = transaction.objectStore(CASAE_STORES.purchaseItems);
    const keys = await requestToPromise(
      itemsStore.index('purchaseSessionId').getAllKeys(IDBKeyRange.only(sessionId)),
    );
    keys.forEach((key) => itemsStore.delete(key));
    await transactionToPromise(transaction);
  }

  async listCompletedSessions(houseId: string): Promise<PurchaseSession[]> {
    await this.initialize();
    const sessions = (await this.listSessionsForHouse(houseId))
      .filter((session) => session.status === 'completed')
      .sort((first, second) =>
        (second.completedAt ?? second.startedAt).localeCompare(
          first.completedAt ?? first.startedAt,
        ),
      );
    return Promise.all(sessions.map((session) => this.hydrateSession(session)));
  }

  private async listSessionsForHouse(houseId: string): Promise<PersistedPurchaseSession[]> {
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      return [...this.database.getMemoryDatabase().purchaseSessions.values()]
        .filter((session) => session.houseId === houseId)
        .map((session) => ({ ...session }));
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseSessions, 'readonly');
    const sessions = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.purchaseSessions)
        .index('houseId')
        .getAll(IDBKeyRange.only(houseId)) as IDBRequest<PersistedPurchaseSession[]>,
    );
    await transactionToPromise(transaction);
    return sessions.map((session) => ({ ...session }));
  }

  private async getSession(id: string): Promise<PersistedPurchaseSession | undefined> {
    await this.initialize();
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const session = this.database.getMemoryDatabase().purchaseSessions.get(id);
      return session ? { ...session } : undefined;
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseSessions, 'readonly');
    const session = await requestToPromise(
      transaction.objectStore(CASAE_STORES.purchaseSessions).get(id) as IDBRequest<
        PersistedPurchaseSession | undefined
      >,
    );
    await transactionToPromise(transaction);
    return session ? { ...session } : undefined;
  }

  private async hydrateSession(session: PersistedPurchaseSession): Promise<PurchaseSession> {
    const nativeDatabase = await this.database.getNativeDatabase();
    if (!nativeDatabase) {
      const items = [...this.database.getMemoryDatabase().purchaseItems.values()]
        .filter((item) => item.houseId === session.houseId && item.purchaseSessionId === session.id)
        .sort((first, second) => first.purchasedAt.localeCompare(second.purchasedAt));
      return cloneSession(session, items);
    }
    const transaction = nativeDatabase.transaction(CASAE_STORES.purchaseItems, 'readonly');
    const items = await requestToPromise(
      transaction
        .objectStore(CASAE_STORES.purchaseItems)
        .index('purchaseSessionId')
        .getAll(IDBKeyRange.only(session.id)) as IDBRequest<PurchaseItem[]>,
    );
    await transactionToPromise(transaction);
    return cloneSession(
      session,
      items
        .filter((item) => item.houseId === session.houseId)
        .sort((first, second) => first.purchasedAt.localeCompare(second.purchasedAt)),
    );
  }
}
