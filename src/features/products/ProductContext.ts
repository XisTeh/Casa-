import { createContext, useContext } from 'react';
import type {
  Category,
  NewProduct,
  ProductUpdate,
  ProductWithLastPurchase,
} from '../../domain/catalog';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import type { LegacyCatalogMigration } from '../../domain/catalog-sync';

export type ProductContextValue = {
  products: ProductWithLastPurchase[];
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  syncStatus: ShoppingSyncStatus;
  createProduct: (input: NewProduct) => Promise<void>;
  updateProduct: (id: string, input: ProductUpdate) => Promise<void>;
  setFavorite: (id: string, favorite: boolean) => Promise<void>;
  setActive: (id: string, active: boolean) => Promise<void>;
  addToList: (id: string) => Promise<'added' | 'already-present'>;
  createCategory: (name: string) => Promise<void>;
  renameCategory: (id: string, name: string) => Promise<void>;
  setCategoryActive: (id: string, active: boolean) => Promise<void>;
  refreshProducts: () => Promise<void>;
  legacyMigration: LegacyCatalogMigration | null;
  importLegacyCatalog: () => Promise<void>;
};

export const productContext = createContext<ProductContextValue | null>(null);

export function useProducts() {
  const context = useContext(productContext);
  if (!context) throw new Error('useProducts deve ser usado dentro de ProductProvider.');
  return context;
}
