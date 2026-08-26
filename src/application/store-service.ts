import type { PurchaseRepository } from '../domain/purchase-repository';
import { HOUSE_ID } from '../domain/shopping-list';
import type { NewStore, Store, StoreUpdate, StoreWithStats } from '../domain/store';
import type { StoreRepository } from '../domain/store-repository';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `store-${crypto.randomUUID()}`;
  }
  return `store-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeInput(input: NewStore) {
  return {
    name: input.name.trim(),
    nickname: input.nickname.trim(),
    address: input.address.trim(),
    notes: input.notes.trim(),
  };
}

export class StoreService {
  constructor(
    private readonly repository: StoreRepository,
    private readonly purchaseRepository: PurchaseRepository,
  ) {}

  async list(houseId = HOUSE_ID): Promise<StoreWithStats[]> {
    await Promise.all([this.repository.initialize(), this.purchaseRepository.initialize()]);
    const [stores, purchases] = await Promise.all([
      this.repository.list(houseId),
      this.purchaseRepository.listCompletedSessions(houseId),
    ]);

    return stores.map((store) => {
      const storePurchases = purchases.filter(
        (purchase) =>
          purchase.storeId === store.id ||
          (!purchase.storeId && purchase.storeNameSnapshot === store.name),
      );
      return {
        ...store,
        purchaseCount: storePurchases.length,
        lastPurchaseAt: storePurchases[0]?.completedAt ?? storePurchases[0]?.startedAt ?? null,
        totalSpentCents: storePurchases.reduce(
          (total, purchase) => total + purchase.totalPriceCents,
          0,
        ),
      };
    });
  }

  async create(input: NewStore, houseId = HOUSE_ID): Promise<Store> {
    const normalized = normalizeInput(input);
    if (!normalized.name) throw new Error('Informe o nome do mercado.');
    const existing = (await this.repository.list(houseId)).find(
      (store) =>
        store.name.toLocaleLowerCase('pt-BR') === normalized.name.toLocaleLowerCase('pt-BR'),
    );
    if (existing) throw new Error('Já existe um mercado com esse nome.');
    const now = new Date().toISOString();
    return this.repository.create({
      id: createId(),
      houseId,
      ...normalized,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id: string, changes: StoreUpdate, houseId = HOUSE_ID) {
    const normalized = normalizeInput({
      name: changes.name ?? '',
      nickname: changes.nickname ?? '',
      address: changes.address ?? '',
      notes: changes.notes ?? '',
    });
    const cleanChanges: StoreUpdate = {};
    if (changes.name !== undefined) {
      if (!normalized.name) throw new Error('Informe o nome do mercado.');
      const duplicated = (await this.repository.list(houseId)).find(
        (store) =>
          store.id !== id &&
          store.name.toLocaleLowerCase('pt-BR') === normalized.name.toLocaleLowerCase('pt-BR'),
      );
      if (duplicated) throw new Error('Já existe um mercado com esse nome.');
      cleanChanges.name = normalized.name;
    }
    if (changes.nickname !== undefined) cleanChanges.nickname = normalized.nickname;
    if (changes.address !== undefined) cleanChanges.address = normalized.address;
    if (changes.notes !== undefined) cleanChanges.notes = normalized.notes;
    return this.repository.update(houseId, id, cleanChanges);
  }

  setActive(id: string, active: boolean, houseId = HOUSE_ID) {
    return this.repository.setActive(houseId, id, active);
  }

  async remove(id: string, houseId = HOUSE_ID) {
    const stores = await this.list(houseId);
    const store = stores.find((candidate) => candidate.id === id);
    if (!store) throw new Error('Este mercado não existe mais.');
    if (store.purchaseCount > 0) {
      throw new Error('Mercados com histórico devem ser desativados, não excluídos.');
    }
    await this.repository.remove(houseId, id);
  }
}
