import type { Category } from './catalog';

export interface CategoryRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<Category[]>;
  get(houseId: string, id: string): Promise<Category | undefined>;
  save(category: Category): Promise<Category>;
}
