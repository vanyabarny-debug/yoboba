import type { menu_item } from '@/lib/types';

export type categorized_item = Pick<menu_item, 'category'> & {
  categories?: string[] | null;
};

export function item_categories(item: categorized_item): string[] {
  const list = [item.category, ...(item.categories ?? [])]
    .map((c) => (c || '').trim())
    .filter(Boolean);
  return [...new Set(list)];
}

export function item_in_category(item: categorized_item, category: string): boolean {
  return item_categories(item).includes(category);
}

export function set_item_categories<T extends categorized_item>(item: T, next: string[]): T {
  const unique = [...new Set(next.map((c) => c.trim()).filter(Boolean))];
  const primary = unique.includes(item.category) ? item.category : unique[0] || item.category;
  return {
    ...item,
    category: primary,
    categories: unique.length ? unique : [primary],
  };
}

export function rename_item_category<T extends categorized_item>(
  item: T,
  old_name: string,
  new_name: string
): T {
  return set_item_categories(
    item,
    item_categories(item).map((c) => (c === old_name ? new_name : c))
  );
}

/** null — у позиции не осталось категорий, её можно удалить */
export function drop_item_category<T extends categorized_item>(item: T, name: string): T | null {
  const next = item_categories(item).filter((c) => c !== name);
  if (next.length === 0) return null;
  return set_item_categories(item, next);
}
