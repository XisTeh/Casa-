import { normalizeCatalogName, type Category } from '../domain/catalog';
import type { CategoryRepository } from '../domain/category-repository';
import type { ProductRepository } from '../domain/product-repository';
import { HOUSE_ID } from '../domain/shopping-list';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return `category-${crypto.randomUUID()}`;
  return `category-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly products: ProductRepository,
  ) {}

  async list(houseId = HOUSE_ID) {
    await this.repository.initialize();
    return this.repository.list(houseId);
  }

  async create(name: string, houseId = HOUSE_ID) {
    const normalizedName = normalizeCatalogName(name);
    if (!normalizedName) throw new Error('Informe o nome da categoria.');
    const duplicate = (await this.list(houseId)).find(
      (category) => category.normalizedName === normalizedName,
    );
    if (duplicate) throw new Error('Já existe uma categoria com esse nome.');
    const now = new Date().toISOString();
    return this.repository.save({
      id: createId(),
      houseId,
      name: name.trim(),
      normalizedName,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async rename(id: string, name: string, houseId = HOUSE_ID) {
    const current = await this.requireCategory(id, houseId);
    const normalizedName = normalizeCatalogName(name);
    if (!normalizedName) throw new Error('Informe o nome da categoria.');
    const duplicate = (await this.list(houseId)).find(
      (category) => category.id !== id && category.normalizedName === normalizedName,
    );
    if (duplicate) throw new Error('Já existe uma categoria com esse nome.');
    return this.repository.save({
      ...current,
      name: name.trim(),
      normalizedName,
      updatedAt: new Date().toISOString(),
    });
  }

  async setActive(id: string, active: boolean, houseId = HOUSE_ID) {
    const current = await this.requireCategory(id, houseId);
    if (!active) {
      const inUse = (await this.products.list(houseId)).some(
        (product) => product.categoryId === id && product.active,
      );
      if (inUse)
        throw new Error('Desative ou mova os produtos desta categoria antes de desativá-la.');
    }
    return this.repository.save({ ...current, active, updatedAt: new Date().toISOString() });
  }

  private async requireCategory(id: string, houseId: string): Promise<Category> {
    const category = await this.repository.get(houseId, id);
    if (!category) throw new Error('Esta categoria não existe mais.');
    return category;
  }
}
