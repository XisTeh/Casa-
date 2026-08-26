import type { Category, ProductWithLastPurchase } from '../domain/catalog';

export type ProductFilters = {
  query: string;
  categoryId: 'all' | string;
  favoriteOnly: boolean;
  recurringOnly: boolean;
  status: 'active' | 'inactive' | 'all';
};

export function filterProducts(
  products: ProductWithLastPurchase[],
  categories: Category[],
  filters: ProductFilters,
) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const query = filters.query
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return products.filter((product) => {
    const searchable = [
      product.normalizedName,
      product.brand,
      categoryById.get(product.categoryId)?.name ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return (
      (!query || searchable.includes(query)) &&
      (filters.categoryId === 'all' || product.categoryId === filters.categoryId) &&
      (!filters.favoriteOnly || product.favorite) &&
      (!filters.recurringOnly || product.isRecurring === true) &&
      (filters.status === 'all' || (filters.status === 'active' ? product.active : !product.active))
    );
  });
}
