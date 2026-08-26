import {
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
  type ShoppingListItem,
  type ShoppingPriority,
} from '../domain/shopping-list';

export type ShoppingListFilters = {
  query: string;
  priority: 'all' | ShoppingPriority;
  category: 'all' | string;
};

export type ShoppingCategoryGroup = {
  key: string;
  category: ShoppingCategory;
  label: string;
  items: ShoppingListItem[];
};

const priorityWeight: Record<ShoppingPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

function normalizeSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function filterShoppingListItems(items: ShoppingListItem[], filters: ShoppingListFilters) {
  const query = normalizeSearchTerm(filters.query.trim());

  return items.filter((item) => {
    const matchesPriority = filters.priority === 'all' || item.priority === filters.priority;
    const matchesCategory =
      filters.category === 'all' || (item.categoryId ?? item.category) === filters.category;
    const searchableValue = normalizeSearchTerm(
      `${item.productName} ${item.preferredBrand} ${item.categoryName ?? item.category}`,
    );
    const matchesSearch = !query || searchableValue.includes(query);

    return matchesPriority && matchesCategory && matchesSearch;
  });
}

export function groupShoppingListItems(items: ShoppingListItem[]): ShoppingCategoryGroup[] {
  const groups = new Map<string, ShoppingCategoryGroup>();
  items.forEach((item) => {
    const key = item.categoryId ?? item.category;
    const group = groups.get(key) ?? {
      key,
      category: item.category,
      label: item.categoryName ?? item.category,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort(
        (first, second) =>
          priorityWeight[first.priority] - priorityWeight[second.priority] ||
          first.createdAt.localeCompare(second.createdAt),
      ),
    }))
    .sort(
      (first, second) =>
        SHOPPING_CATEGORIES.indexOf(first.category) -
          SHOPPING_CATEGORIES.indexOf(second.category) ||
        first.label.localeCompare(second.label, 'pt-BR'),
    );
}
