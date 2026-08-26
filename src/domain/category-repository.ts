import type { Category, DefaultCategoryDefinition } from './catalog';

export interface CategoryRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<Category[]>;
  get(houseId: string, id: string): Promise<Category | undefined>;
  save(category: Category): Promise<Category>;
  ensureDefaults(
    houseId: string,
    definitions: ReadonlyArray<DefaultCategoryDefinition>,
  ): Promise<Category[]>;
}
