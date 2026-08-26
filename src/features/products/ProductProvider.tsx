import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CategoryService } from '../../application/category-service';
import type { ProductService } from '../../application/product-service';
import { defaultCategoryService, defaultProductService } from '../../app/app-services';
import type {
  Category,
  NewProduct,
  ProductUpdate,
  ProductWithLastPurchase,
} from '../../domain/catalog';
import { productContext } from './ProductContext';
import { useHousehold } from '../house/HouseContext';
import type { LegacyCatalogMigration } from '../../domain/catalog-sync';
import type { ShoppingSyncStatus } from '../../domain/shopping-list';
import { LegacyCatalogMigrationDialog } from './LegacyCatalogMigrationDialog';

type ProductProviderProps = {
  children: ReactNode;
  productService?: ProductService;
  categoryService?: CategoryService;
};

export function ProductProvider({
  children,
  productService = defaultProductService,
  categoryService = defaultCategoryService,
}: ProductProviderProps) {
  const { activeHouse, activeMember } = useHousehold();
  const actor = useMemo(
    () => ({
      houseId: activeHouse.id,
      memberId: activeMember.id,
      memberName: activeMember.displayName,
    }),
    [activeHouse.id, activeMember.displayName, activeMember.id],
  );
  const [products, setProducts] = useState<ProductWithLastPurchase[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ShoppingSyncStatus>({ state: 'local', pending: 0 });
  const [legacyPrompt, setLegacyPrompt] = useState<{
    houseId: string;
    migration: LegacyCatalogMigration;
  } | null>(null);
  const [migrationDismissedForHouse, setMigrationDismissedForHouse] = useState<string | null>(null);

  const refreshProducts = useCallback(async () => {
    const [savedProducts, savedCategories] = await Promise.all([
      productService.list(activeHouse.id),
      categoryService.list(activeHouse.id),
    ]);
    setProducts(savedProducts);
    setCategories(savedCategories);
    setError(null);
  }, [activeHouse.id, categoryService, productService]);

  useEffect(() => {
    let active = true;
    const unsubscribe = productService.subscribe(
      activeHouse.id,
      () => void refreshProducts(),
      (status) => active && setSyncStatus(status),
    );
    void productService
      .syncNow(activeHouse.id)
      .then(() => productService.getLegacyMigration(activeHouse.id))
      .then(
        (migration) =>
          active && setLegacyPrompt(migration ? { houseId: activeHouse.id, migration } : null),
      );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeHouse.id, productService, refreshProducts]);

  useEffect(() => {
    let current = true;

    async function loadCatalog() {
      try {
        const [savedProducts, savedCategories] = await Promise.all([
          productService.list(activeHouse.id),
          categoryService.list(activeHouse.id),
        ]);
        if (current) {
          setProducts(savedProducts);
          setCategories(savedCategories);
          setError(null);
        }
      } catch {
        if (current) setError('Não foi possível abrir o catálogo local.');
      } finally {
        if (current) setIsLoading(false);
      }
    }

    void loadCatalog();
    return () => {
      current = false;
    };
  }, [activeHouse.id, categoryService, productService]);

  const createProduct = useCallback(
    async (input: NewProduct) => {
      await productService.create(input, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, productService, refreshProducts],
  );
  const updateProduct = useCallback(
    async (id: string, input: ProductUpdate) => {
      await productService.update(id, input, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, productService, refreshProducts],
  );
  const setFavorite = useCallback(
    async (id: string, favorite: boolean) => {
      await productService.setFavorite(id, favorite, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, productService, refreshProducts],
  );
  const setActive = useCallback(
    async (id: string, active: boolean) => {
      await productService.setActive(id, active, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, productService, refreshProducts],
  );
  const addToList = useCallback(
    async (id: string) => {
      const result = await productService.addToShoppingList(id, actor);
      return result.status;
    },
    [actor, productService],
  );
  const createCategory = useCallback(
    async (name: string) => {
      await categoryService.create(name, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, categoryService, refreshProducts],
  );
  const renameCategory = useCallback(
    async (id: string, name: string) => {
      await categoryService.rename(id, name, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, categoryService, refreshProducts],
  );
  const setCategoryActive = useCallback(
    async (id: string, active: boolean) => {
      await categoryService.setActive(id, active, activeHouse.id);
      await refreshProducts();
    },
    [activeHouse.id, categoryService, refreshProducts],
  );

  const value = useMemo(
    () => ({
      products,
      categories,
      isLoading,
      error,
      syncStatus,
      createProduct,
      updateProduct,
      setFavorite,
      setActive,
      addToList,
      createCategory,
      renameCategory,
      setCategoryActive,
      refreshProducts,
    }),
    [
      addToList,
      categories,
      createCategory,
      createProduct,
      error,
      syncStatus,
      isLoading,
      products,
      refreshProducts,
      renameCategory,
      setActive,
      setCategoryActive,
      setFavorite,
      updateProduct,
    ],
  );

  return (
    <productContext.Provider value={value}>
      {children}
      {legacyPrompt?.houseId === activeHouse.id &&
        migrationDismissedForHouse !== activeHouse.id && (
          <LegacyCatalogMigrationDialog
            migration={legacyPrompt.migration}
            houseName={activeHouse.name}
            onClose={() => setMigrationDismissedForHouse(activeHouse.id)}
            onImport={async () => {
              await legacyPrompt.migration.importIntoHouse();
              setLegacyPrompt(null);
              await refreshProducts();
            }}
          />
        )}
    </productContext.Provider>
  );
}
