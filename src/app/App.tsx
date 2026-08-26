import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ShoppingListService } from '../application/shopping-list-service';
import type { StoreService } from '../application/store-service';
import type { PurchaseService } from '../application/purchase-service';
import type { ProductService } from '../application/product-service';
import type { CategoryService } from '../application/category-service';
import type { BudgetService } from '../application/budget-service';
import type { HouseService } from '../application/house-service';
import { AppShell } from '../components/AppShell/AppShell';
import { HomePage } from '../features/home/HomePage';
import { HistoryPage } from '../features/history/HistoryPage';
import { ShoppingListPage } from '../features/shopping-list/ShoppingListPage';
import { ShoppingListProvider } from '../features/shopping-list/ShoppingListProvider';
import { PurchasePage } from '../features/purchase/PurchasePage';
import { PurchaseProvider } from '../features/purchase/PurchaseProvider';
import { StoreProvider } from '../features/stores/StoreProvider';
import { StorePage } from '../features/stores/StorePage';
import { ProductProvider } from '../features/products/ProductProvider';
import { ProductPage } from '../features/products/ProductPage';
import { BudgetProvider } from '../features/spending/BudgetProvider';
import { SpendingPage } from '../features/spending/SpendingPage';
import { HouseProvider } from '../features/house/HouseProvider';
import { useHousehold } from '../features/house/HouseContext';
import { SettingsPage } from '../features/settings/SettingsPage';
import type { AuthService } from '../application/auth-service';
import type { OnlineHouseService } from '../application/online-house-service';
import { isSupabaseConfigured, resolveAppRuntimeMode } from '../lib/env';
import {
  createDefaultAuthService,
  createDefaultOnlineHouseService,
  createDefaultOnlineShoppingListService,
  createDefaultOnlineCatalogServices,
} from './app-services';
import { AuthProvider } from '../features/auth/AuthProvider';
import { useAuth } from '../features/auth/AuthContext';
import { AuthPage } from '../features/auth/AuthPage';
import { OnlineHouseProvider } from '../features/house/OnlineHouseProvider';
import { ErrorState, LoadingState } from '../components/StateView/StateView';
import { useMemo } from 'react';

type AppProps = {
  shoppingListService?: ShoppingListService;
  purchaseService?: PurchaseService;
  storeService?: StoreService;
  productService?: ProductService;
  categoryService?: CategoryService;
  budgetService?: BudgetService;
  houseService?: HouseService;
  authService?: AuthService;
  onlineHouseService?: OnlineHouseService;
  remoteMode?: boolean;
};

function HouseScopedApplication(props: Omit<AppProps, 'houseService'>) {
  const { activeHouse } = useHousehold();
  return (
    <ShoppingListProvider key={activeHouse.id} service={props.shoppingListService}>
      <StoreProvider service={props.storeService}>
        <ProductProvider
          productService={props.productService}
          categoryService={props.categoryService}
        >
          <BudgetProvider service={props.budgetService}>
            <PurchaseProvider service={props.purchaseService}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />
                  <Route path="lista" element={<ShoppingListPage />} />
                  <Route path="comprar" element={<PurchasePage />} />
                  <Route path="produtos" element={<ProductPage />} />
                  <Route path="historico" element={<HistoryPage />} />
                  <Route path="gastos" element={<SpendingPage />} />
                  <Route path="mercados" element={<StorePage />} />
                  <Route path="configuracoes" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate replace to="/" />} />
                </Route>
              </Routes>
            </PurchaseProvider>
          </BudgetProvider>
        </ProductProvider>
      </StoreProvider>
    </ShoppingListProvider>
  );
}

export function App({
  shoppingListService,
  purchaseService,
  storeService,
  productService,
  categoryService,
  budgetService,
  houseService,
  authService,
  onlineHouseService,
  remoteMode,
}: AppProps) {
  const runtimeMode = resolveAppRuntimeMode({
    allowLocalFallback: import.meta.env.DEV || ['test', 'e2e'].includes(import.meta.env.MODE),
    production: import.meta.env.PROD,
    remoteMode,
    supabaseConfigured: isSupabaseConfigured(),
  });
  const resolvedRemoteMode = runtimeMode === 'remote';
  const resolvedAuthService = useMemo(
    () => (resolvedRemoteMode ? (authService ?? createDefaultAuthService()) : undefined),
    [authService, resolvedRemoteMode],
  );
  const resolvedHouseService = useMemo(
    () =>
      resolvedRemoteMode ? (onlineHouseService ?? createDefaultOnlineHouseService()) : undefined,
    [onlineHouseService, resolvedRemoteMode],
  );
  if (runtimeMode === 'configuration-error') {
    return (
      <main className="auth-page">
        <ErrorState
          description="A configuração online está indisponível. Tente novamente em alguns instantes."
          title="Não foi possível conectar o Casaê."
        />
      </main>
    );
  }
  if (resolvedRemoteMode) {
    return (
      <BrowserRouter>
        <AuthProvider service={resolvedAuthService!}>
          <RemoteApplication
            onlineHouseService={resolvedHouseService!}
            {...{
              shoppingListService,
              purchaseService,
              storeService,
              productService,
              categoryService,
              budgetService,
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    );
  }
  return (
    <HouseProvider service={houseService}>
      <BrowserRouter>
        <HouseScopedApplication
          budgetService={budgetService}
          categoryService={categoryService}
          productService={productService}
          purchaseService={purchaseService}
          shoppingListService={shoppingListService}
          storeService={storeService}
        />
      </BrowserRouter>
    </HouseProvider>
  );
}

function RemoteApplication({
  onlineHouseService,
  ...props
}: Omit<AppProps, 'houseService' | 'authService' | 'remoteMode'> & {
  onlineHouseService: OnlineHouseService;
}) {
  const auth = useAuth();
  const location = useLocation();
  const authenticatedUserId = auth.session?.user.id;
  const remoteShoppingListService = useMemo(
    () =>
      props.shoppingListService ??
      (authenticatedUserId
        ? createDefaultOnlineShoppingListService(authenticatedUserId)
        : undefined),
    [authenticatedUserId, props.shoppingListService],
  );
  const remoteCatalogServices = useMemo(
    () =>
      authenticatedUserId && remoteShoppingListService
        ? createDefaultOnlineCatalogServices(remoteShoppingListService, authenticatedUserId)
        : undefined,
    [authenticatedUserId, remoteShoppingListService],
  );
  if (auth.initializing) {
    return (
      <main className="auth-page">
        <LoadingState description="Restaurando sua sessão com segurança…" />
      </main>
    );
  }
  if (location.pathname === '/nova-senha') return <AuthPage mode="new-password" />;
  if (!auth.session) {
    return (
      <Routes>
        <Route path="/entrar" element={<AuthPage mode="sign-in" />} />
        <Route path="/criar-conta" element={<AuthPage mode="sign-up" />} />
        <Route path="/recuperar-senha" element={<AuthPage mode="forgot" />} />
        <Route path="*" element={<Navigate replace to="/entrar" />} />
      </Routes>
    );
  }
  if (['/entrar', '/criar-conta', '/recuperar-senha'].includes(location.pathname)) {
    return <Navigate replace to="/" />;
  }
  return (
    <OnlineHouseProvider
      email={auth.session.user.email}
      service={onlineHouseService}
      userId={auth.session.user.id}
    >
      <HouseScopedApplication
        {...props}
        categoryService={props.categoryService ?? remoteCatalogServices?.categoryService}
        productService={props.productService ?? remoteCatalogServices?.productService}
        purchaseService={props.purchaseService ?? remoteCatalogServices?.purchaseService}
        shoppingListService={remoteShoppingListService}
        storeService={props.storeService ?? remoteCatalogServices?.storeService}
      />
    </OnlineHouseProvider>
  );
}
