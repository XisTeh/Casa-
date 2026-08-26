import type { Product } from './catalog';

export interface ProductRepository {
  initialize(): Promise<void>;
  list(houseId: string): Promise<Product[]>;
  get(houseId: string, id: string): Promise<Product | undefined>;
  save(product: Product): Promise<Product>;
}
