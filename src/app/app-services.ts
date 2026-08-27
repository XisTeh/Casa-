import { PurchaseService } from '../application/purchase-service';
import { ShoppingListService } from '../application/shopping-list-service';
import { StoreService } from '../application/store-service';
import { ProductService } from '../application/product-service';
import { CategoryService } from '../application/category-service';
import { CasaeLocalDatabase } from '../infrastructure/local-database/CasaeLocalDatabase';
import { LocalPurchaseRepository } from '../infrastructure/purchase/LocalPurchaseRepository';
import { LocalShoppingRepository } from '../infrastructure/shopping/LocalShoppingRepository';
import { LocalStoreRepository } from '../infrastructure/store/LocalStoreRepository';
import { LocalProductRepository } from '../infrastructure/catalog/LocalProductRepository';
import { LocalCategoryRepository } from '../infrastructure/catalog/LocalCategoryRepository';
import { LocalBudgetRepository } from '../infrastructure/budget/LocalBudgetRepository';
import { BudgetService } from '../application/budget-service';
import { LocalHouseRepository } from '../infrastructure/house/LocalHouseRepository';
import { HouseService } from '../application/house-service';
import { AuthService } from '../application/auth-service';
import { OnlineHouseService } from '../application/online-house-service';
import { SupabaseAuthRepository } from '../infrastructure/supabase/SupabaseAuthRepository';
import { SupabaseHouseRepository } from '../infrastructure/supabase/SupabaseHouseRepository';
import { LocalProfileAvatarRepository } from '../infrastructure/profile/LocalProfileAvatarRepository';
import { OfflineFirstShoppingRepository } from '../infrastructure/shopping/OfflineFirstShoppingRepository';
import { SupabaseShoppingRepository } from '../infrastructure/supabase/SupabaseShoppingRepository';
import { SupabaseCatalogRepository } from '../infrastructure/supabase/SupabaseCatalogRepository';
import { OfflineFirstCatalogSync } from '../infrastructure/catalog/OfflineFirstCatalogRepository';
import { OfflineFirstPurchaseRepository } from '../infrastructure/purchase/OfflineFirstPurchaseRepository';
import { SupabasePurchaseRepository } from '../infrastructure/supabase/SupabasePurchaseRepository';
import { OfflineFirstBudgetRepository } from '../infrastructure/budget/OfflineFirstBudgetRepository';
import { SupabaseBudgetRepository } from '../infrastructure/supabase/SupabaseBudgetRepository';

export const defaultLocalDatabase = new CasaeLocalDatabase();
export const defaultHouseRepository = new LocalHouseRepository(defaultLocalDatabase);
export const defaultShoppingListRepository = new LocalShoppingRepository(defaultLocalDatabase);
export const defaultShoppingListService = new ShoppingListService(defaultShoppingListRepository);
export const defaultPurchaseRepository = new LocalPurchaseRepository(defaultLocalDatabase);
export const defaultProductRepository = new LocalProductRepository(defaultLocalDatabase);
export const defaultCategoryRepository = new LocalCategoryRepository(defaultLocalDatabase);
export const defaultCategoryService = new CategoryService(
  defaultCategoryRepository,
  defaultProductRepository,
);
export const defaultProductService = new ProductService(
  defaultProductRepository,
  defaultCategoryRepository,
  defaultPurchaseRepository,
  defaultShoppingListService,
);
export const defaultPurchaseService = new PurchaseService(
  defaultPurchaseRepository,
  defaultProductService,
  undefined,
  defaultShoppingListService,
);
export const defaultStoreRepository = new LocalStoreRepository(defaultLocalDatabase);
export const defaultStoreService = new StoreService(
  defaultStoreRepository,
  defaultPurchaseRepository,
);
export const defaultBudgetRepository = new LocalBudgetRepository(defaultLocalDatabase);
export const defaultBudgetService = new BudgetService(defaultBudgetRepository);
export const defaultHouseService = new HouseService(defaultHouseRepository, defaultCategoryService);

export const createDefaultAuthService = () => new AuthService(new SupabaseAuthRepository());
export const createDefaultOnlineHouseService = () =>
  new OnlineHouseService(
    new SupabaseHouseRepository(),
    new LocalProfileAvatarRepository(defaultLocalDatabase),
    undefined,
    undefined,
    defaultCategoryService,
  );
export const createDefaultOnlineShoppingListService = (userId: string) =>
  new ShoppingListService(
    new OfflineFirstShoppingRepository(
      defaultLocalDatabase,
      new SupabaseShoppingRepository(),
      userId,
    ),
  );

export const createDefaultOnlineCatalogServices = (
  shoppingListService: ShoppingListService,
  userId: string,
) => {
  const sync = new OfflineFirstCatalogSync(
    defaultLocalDatabase,
    new SupabaseCatalogRepository(),
    undefined,
    userId,
  );
  const purchaseRepository = new OfflineFirstPurchaseRepository(
    defaultLocalDatabase,
    new SupabasePurchaseRepository(),
    userId,
  );
  const categoryService = new CategoryService(sync.categories, sync.products);
  const productService = new ProductService(
    sync.products,
    sync.categories,
    purchaseRepository,
    shoppingListService,
  );
  return {
    categoryService,
    productService,
    storeService: new StoreService(sync.stores, purchaseRepository),
    purchaseService: new PurchaseService(
      purchaseRepository,
      productService,
      userId,
      shoppingListService,
    ),
  };
};

export const createDefaultOnlineBudgetService = (userId: string) =>
  new BudgetService(
    new OfflineFirstBudgetRepository(defaultLocalDatabase, new SupabaseBudgetRepository(), userId),
  );
