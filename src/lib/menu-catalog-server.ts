import { read_json_store, write_json_store } from '@/lib/data-store';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { menu_item } from '@/lib/types';
import type { menu_store } from '@/lib/menu-store';

const store_key = 'published-menu';
const catalog_row_id = 'main';
let published_cache: { at: number; store: menu_store | null } | null = null;

type menu_catalog_row = {
  id: string;
  store: menu_store;
};

function merge_items(previous: menu_item[], incoming: menu_item[]) {
  const by_id = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) {
    by_id.set(item.id, item);
  }
  return [...by_id.values()];
}

function merge_stores(previous: menu_store | null, incoming: menu_store): menu_store {
  if (!previous) return incoming;
  return {
    ...incoming,
    items: merge_items(previous.items ?? [], incoming.items ?? []),
  };
}

async function read_fallback(): Promise<menu_store | null> {
  return read_json_store<menu_store | null>(store_key, null);
}

export async function read_published_menu(): Promise<menu_store | null> {
  if (published_cache && Date.now() - published_cache.at < 8_000) {
    return published_cache.store;
  }
  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { data, error } = await admin
      .from('menu_catalog')
      .select('store')
      .eq('id', catalog_row_id)
      .maybeSingle();
    if (!error && data?.store) {
      const store = (data as menu_catalog_row).store;
      published_cache = { at: Date.now(), store };
      return store;
    }
    // пока таблица не создана — временно читаем старое хранилище, но не падаем
    if (!error || /does not exist/i.test(error.message)) {
      const fallback = await read_fallback();
      published_cache = { at: Date.now(), store: fallback };
      return fallback;
    }
    console.error('menu catalog read', error.message);
    const fallback = await read_fallback();
    published_cache = { at: Date.now(), store: fallback };
    return fallback;
  }

  const fallback = await read_fallback();
  published_cache = { at: Date.now(), store: fallback };
  return fallback;
}

export async function write_published_menu(store: menu_store): Promise<void> {
  published_cache = null;
  if (is_supabase_configured()) {
    const admin = create_service_client();
    const previous = await read_published_menu();
    const durable = merge_stores(previous, store);
    const { error } = await admin.from('menu_catalog').upsert(
      {
        id: catalog_row_id,
        store: durable,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (!error) return;
    if (!/does not exist/i.test(error.message)) {
      console.error('menu catalog write', error.message);
      throw new Error(error.message);
    }
    // таблица ещё не создана — старый fallback оставляем только как запасной путь
    await write_json_store(store_key, durable);
    return;
  }

  await write_json_store(store_key, store);
}

export function is_menu_store_payload(value: unknown): value is menu_store {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<menu_store>;
  return Array.isArray(row.items) && Array.isArray(row.categories);
}
