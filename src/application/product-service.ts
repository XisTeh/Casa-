import {
  normalizeCatalogName,
  resolveShoppingCategory,
  type NewProduct,
  type Product,
  type ProductUpdate,
  type ProductWithLastPurchase,
} from '../domain/catalog';
import type { ManualPurchaseItemInput } from '../domain/purchase';
import type { ProductRepository } from '../domain/product-repository';
import type { PurchaseRepository } from '../domain/purchase-repository';
import { HOUSE_ID } from '../domain/shopping-list';
import type { ActiveHousehold } from '../domain/house';
import type { CategoryRepository } from '../domain/category-repository';
import type { ShoppingListService } from './shopping-list-service';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class DuplicateProductError extends Error {
  constructor(readonly existingProduct: Product) {
    super(
      existingProduct.active
        ? 'Já existe um produto com esse nome.'
        : 'Este produto já existe e está inativo.',
    );
  }
}

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly purchases: PurchaseRepository,
    private readonly shoppingList?: ShoppingListService,
  ) {}

  async list(houseId = HOUSE_ID): Promise<ProductWithLastPurchase[]> {
    await this.repository.initialize();
    const [products, sessions] = await Promise.all([
      this.repository.list(houseId),
      this.purchases.listCompletedSessions(houseId),
    ]);
    const latestByProduct = new Map<string, ProductWithLastPurchase['lastPurchase']>();
    sessions
      .flatMap((session) => session.items)
      .filter((item) => Boolean(item.productId))
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))
      .forEach((item) => {
        if (!latestByProduct.has(item.productId!)) {
          latestByProduct.set(item.productId!, {
            unitPriceCents: item.unitPriceCents,
            storeId: item.storeId,
            storeName: item.storeNameSnapshot,
            purchasedAt: item.purchasedAt,
          });
        }
      });
    return products.map((product) => ({
      ...product,
      lastPurchase: latestByProduct.get(product.id),
    }));
  }

  async create(input: NewProduct, houseId = HOUSE_ID) {
    return this.createWithId(createId('product'), input, houseId);
  }

  private async createWithId(id: string, input: NewProduct, houseId: string) {
    this.validate(input);
    const normalizedName = normalizeCatalogName(input.name);
    const products = await this.repository.list(houseId);
    const duplicate = products.find((product) => product.normalizedName === normalizedName);
    if (duplicate) throw new DuplicateProductError(duplicate);
    const category = await this.categories.get(houseId, input.categoryId);
    if (!category) throw new Error('Selecione uma categoria válida.');
    const now = new Date().toISOString();
    const saved = await this.repository.save({
      id,
      houseId,
      name: input.name.trim(),
      normalizedName,
      brand: input.brand.trim(),
      categoryId: input.categoryId,
      defaultQuantity: input.defaultQuantity,
      defaultUnit: input.defaultUnit,
      notes: input.notes.trim(),
      favorite: input.favorite,
      isRecurring: input.isRecurring ?? false,
      recurrenceDays: input.isRecurring ? input.recurrenceDays : undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (this.shoppingList) {
      const exactItems = (await this.shoppingList.list(houseId)).filter(
        (item) =>
          !item.productId &&
          !item.houseProductId &&
          normalizeCatalogName(item.productName) === normalizedName,
      );
      await Promise.all(
        exactItems.map((item) =>
          this.shoppingList!.update(
            item.id,
            {
              productId: saved.id,
              categoryId: saved.categoryId,
              categoryName: category.name,
            },
            houseId,
          ),
        ),
      );
    }
    return saved;
  }

  async update(id: string, changes: ProductUpdate, houseId = HOUSE_ID) {
    const current = await this.repository.get(houseId, id);
    if (!current) throw new Error('Este produto não existe mais.');
    const merged: NewProduct = {
      name: changes.name ?? current.name,
      brand: changes.brand ?? current.brand,
      categoryId: changes.categoryId ?? current.categoryId,
      defaultQuantity:
        'defaultQuantity' in changes ? changes.defaultQuantity : current.defaultQuantity,
      defaultUnit: changes.defaultUnit ?? current.defaultUnit,
      notes: changes.notes ?? current.notes,
      favorite: changes.favorite ?? current.favorite,
      isRecurring: changes.isRecurring ?? current.isRecurring ?? false,
      recurrenceDays: 'recurrenceDays' in changes ? changes.recurrenceDays : current.recurrenceDays,
    };
    this.validate(merged);
    const normalizedName = normalizeCatalogName(merged.name);
    const duplicate = (await this.repository.list(houseId)).find(
      (product) => product.id !== id && product.normalizedName === normalizedName,
    );
    if (duplicate) throw new DuplicateProductError(duplicate);
    if (!(await this.categories.get(houseId, merged.categoryId)))
      throw new Error('Selecione uma categoria válida.');
    return this.repository.save({
      ...current,
      ...merged,
      name: merged.name.trim(),
      brand: merged.brand.trim(),
      notes: merged.notes.trim(),
      normalizedName,
      recurrenceDays: merged.isRecurring ? merged.recurrenceDays : undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  async setFavorite(id: string, favorite: boolean, houseId = HOUSE_ID) {
    return this.patchState(id, { favorite }, houseId);
  }

  async setActive(id: string, active: boolean, houseId = HOUSE_ID) {
    return this.patchState(id, { active }, houseId);
  }

  async addToShoppingList(
    id: string,
    actor: ActiveHousehold = {
      houseId: HOUSE_ID,
      memberId: 'member-raabe-legacy',
      memberName: 'Raabe',
    },
  ) {
    if (!this.shoppingList) throw new Error('A Lista não está disponível.');
    const product = await this.repository.get(actor.houseId, id);
    if (!product || !product.active) throw new Error('Este produto não está ativo.');
    const existing = (await this.shoppingList.list(actor.houseId)).find(
      (item) => item.productId === id || item.houseProductId === id,
    );
    if (existing) return { status: 'already-present' as const, item: existing };
    const category = await this.categories.get(actor.houseId, product.categoryId);
    const item = await this.shoppingList.create(
      {
        productId: product.id,
        categoryId: product.categoryId,
        categoryName: category?.name,
        productName: product.name,
        preferredBrand: product.brand,
        category: category?.legacyKey ?? 'outros',
        quantity: product.defaultQuantity ?? 1,
        unit: product.defaultUnit,
        notes: product.notes,
        priority: 'normal',
      },
      actor,
    );
    return { status: 'added' as const, item };
  }

  async findOrCreateFromPurchase(input: ManualPurchaseItemInput, houseId = HOUSE_ID) {
    const products = await this.repository.list(houseId);
    if (input.productId) {
      const byId = products.find((product) => product.id === input.productId);
      if (byId) return byId.active ? byId : this.patchState(byId.id, { active: true }, houseId);
    }
    const normalizedName = normalizeCatalogName(input.productName);
    const exact = products.filter((product) => product.normalizedName === normalizedName);
    if (exact.length === 1) {
      return exact[0]!.active
        ? exact[0]!
        : this.patchState(exact[0]!.id, { active: true }, houseId);
    }
    const categories = await this.categories.list(houseId);
    const category = resolveShoppingCategory(categories, input.category);
    if (!category) throw new Error('A categoria Outros não está disponível.');
    return this.createWithId(
      input.productId ?? createId('product'),
      {
        name: input.productName,
        brand: input.brand ?? '',
        categoryId: category.id,
        defaultQuantity: input.quantity,
        defaultUnit: input.unit,
        notes: '',
        favorite: false,
      },
      houseId,
    );
  }

  private async patchState(
    id: string,
    changes: Pick<Partial<Product>, 'active' | 'favorite'>,
    houseId: string,
  ) {
    const current = await this.repository.get(houseId, id);
    if (!current) throw new Error('Este produto não existe mais.');
    return this.repository.save({ ...current, ...changes, updatedAt: new Date().toISOString() });
  }

  private validate(input: NewProduct) {
    if (!input.name.trim()) throw new Error('Informe o nome do produto.');
    if (!input.categoryId) throw new Error('Selecione uma categoria.');
    if (
      input.defaultQuantity !== undefined &&
      (!Number.isFinite(input.defaultQuantity) || input.defaultQuantity <= 0)
    ) {
      throw new Error('Informe uma quantidade padrão válida.');
    }
    if (
      input.isRecurring &&
      (!Number.isInteger(input.recurrenceDays) ||
        input.recurrenceDays === undefined ||
        input.recurrenceDays < 1 ||
        input.recurrenceDays > 365)
    ) {
      throw new Error('Informe uma recorrência entre 1 e 365 dias.');
    }
  }
}
