import { read_json_store, write_json_store } from '@/lib/data-store';
import type { menu_store } from '@/lib/menu-store';

const store_key = 'published-menu';

export async function read_published_menu(): Promise<menu_store | null> {
  const stored = await read_json_store<menu_store | null>(store_key, null);
  if (!stored || !Array.isArray(stored.items) || stored.items.length === 0) {
    return null;
  }
  return stored;
}

export async function write_published_menu(store: menu_store): Promise<void> {
  await write_json_store(store_key, store);
}

export function is_menu_store_payload(value: unknown): value is menu_store {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<menu_store>;
  return Array.isArray(row.items) && Array.isArray(row.categories);
}
