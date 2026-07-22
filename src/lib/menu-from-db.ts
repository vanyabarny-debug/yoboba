import { default_categories } from '@/lib/menu-store';
import { normalize_menu_item_images } from '@/lib/menu-store';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import type { menu_item } from '@/lib/types';

export function normalize_menu_prep_minutes(items: menu_item[]) {
  return items.map((item) => ({
    ...item,
    prep_minutes:
      typeof item.prep_minutes === 'number' && item.prep_minutes > 0
        ? Math.round(item.prep_minutes)
        : DEFAULT_PREP_MINUTES,
  }));
}

export function resolve_menu_categories(menu: menu_item[]) {
  if (menu.length === 0) return [...default_categories];

  const from_menu = [...new Set(menu.map((item) => item.category))];
  const ordered = default_categories.filter((category) => from_menu.includes(category));
  const extras = from_menu.filter((category) => !default_categories.includes(category));

  return ordered.length > 0 ? [...ordered, ...extras] : from_menu;
}

export function resolve_initial_menu(db_menu: menu_item[] | null | undefined) {
  if (!db_menu || db_menu.length === 0) return null;
  return normalize_menu_prep_minutes(normalize_menu_item_images(db_menu));
}
