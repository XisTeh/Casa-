import type { PurchaseSession } from '../domain/purchase';
import type { ShoppingCategory, ShoppingListItem, ShoppingUnit } from '../domain/shopping-list';

export type KnownProduct = {
  identity: string;
  productId: string;
  name: string;
  brand: string;
  category: ShoppingCategory;
  categoryName?: string;
  unit: ShoppingUnit;
  defaultQuantity?: number;
  lastPriceCents?: number;
  lastPurchasedAt?: string;
  lastStoreName?: string;
};

export function normalizeProductName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

export function getShoppingListProductId(item: ShoppingListItem) {
  return item.productId ?? item.houseProductId ?? `shopping-product:${item.id}`;
}

export function buildKnownProducts(
  shoppingItems: ShoppingListItem[],
  completedSessions: PurchaseSession[],
  activeSession?: PurchaseSession | null,
) {
  const products = new Map<string, KnownProduct>();

  shoppingItems.forEach((item) => {
    const productId = getShoppingListProductId(item);
    products.set(productId, {
      identity: productId,
      productId,
      name: item.productName,
      brand: item.preferredBrand,
      category: item.category,
      categoryName: item.categoryName,
      unit: item.unit,
    });
  });

  [...completedSessions, ...(activeSession ? [activeSession] : [])]
    .flatMap((session) => session.items)
    .sort((first, second) => first.purchasedAt.localeCompare(second.purchasedAt))
    .forEach((item) => {
      const productId =
        item.productId ?? `legacy-name:${normalizeProductName(item.productNameSnapshot)}`;
      products.set(productId, {
        identity: productId,
        productId,
        name: item.productNameSnapshot,
        brand: item.brandSnapshot,
        category: item.categorySnapshot,
        categoryName: item.categoryNameSnapshot,
        unit: item.unitSnapshot,
        lastPriceCents: item.unitPriceCents,
        lastPurchasedAt: item.purchasedAt,
        lastStoreName: item.storeNameSnapshot,
      });
    });

  return [...products.values()].sort((first, second) => {
    if (first.lastPurchasedAt !== second.lastPurchasedAt) {
      return (second.lastPurchasedAt ?? '').localeCompare(first.lastPurchasedAt ?? '');
    }
    return first.name.localeCompare(second.name, 'pt-BR');
  });
}

export function findKnownProductSuggestions(products: KnownProduct[], query: string, limit = 5) {
  const normalizedQuery = normalizeProductName(query);
  if (normalizedQuery.length < 2) return [];
  return products
    .filter((product) => normalizeProductName(product.name).includes(normalizedQuery))
    .slice(0, limit);
}

export function findUnambiguousExactProduct(products: KnownProduct[], name: string) {
  const normalizedName = normalizeProductName(name);
  const matches = products.filter(
    (product) => normalizeProductName(product.name) === normalizedName,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
