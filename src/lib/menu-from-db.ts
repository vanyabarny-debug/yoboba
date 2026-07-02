import { default_categories } from '@/lib/menu-store';
import type { menu_item } from '@/lib/types';

export function resolve_menu_categories(menu: menu_item[]) {
  if (menu.length === 0) return [...default_categories];

  const from_menu = [...new Set(menu.map((item) => item.category))];
  const ordered = default_categories.filter((category) => from_menu.includes(category));
  const extras = from_menu.filter((category) => !default_categories.includes(category));

  return ordered.length > 0 ? [...ordered, ...extras] : from_menu;
}

export function resolve_initial_menu(db_menu: menu_item[] | null | undefined) {
  return db_menu && db_menu.length > 0 ? db_menu : null;
}
