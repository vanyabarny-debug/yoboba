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

/** категории, которых ещё нет в каталоге, но они есть у пришедших позиций */
function categories_with_items(base: string[], items: menu_item[]) {
  const out = [...base];
  for (const item of items) {
    for (const cat of [item.category, ...(item.categories ?? [])]) {
      if (cat && !out.includes(cat)) out.push(cat);
    }
  }
  return out;
}

/**
 * partial — пришли только изменённые позиции: остальное меню, категории и стили берём из базы,
 * чтобы устаревшая копия с другого устройства не откатывала чужие правки
 */
function merge_stores(previous: menu_store | null, incoming: menu_store, partial = false): menu_store {
  if (!previous) return incoming;
  const removed = new Set([...(previous.removed_item_ids ?? []), ...(incoming.removed_item_ids ?? [])]);
  const items = merge_items(previous.items ?? [], incoming.items ?? []).filter((item) => !removed.has(item.id));
  if (partial) {
    return {
      ...previous,
      categories: categories_with_items(previous.categories ?? [], incoming.items ?? []),
      removed_item_ids: [...removed],
      items,
    };
  }
  return {
    ...incoming,
    removed_item_ids: [...removed],
    items,
  };
}

async function read_fallback(): Promise<menu_store | null> {
  return read_json_store<menu_store | null>(store_key, null);
}

export async function read_published_menu(): Promise<menu_store | null> {
  if (published_cache && Date.now() - published_cache.at < 5 * 60_000) {
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

let write_tail: Promise<void> = Promise.resolve();

/** записи по очереди: иначе две одновременные правки читают одно «до» и одна теряется */
export function write_published_menu(store: menu_store, opts: { partial?: boolean } = {}): Promise<void> {
  const run = write_tail.then(
    () => write_now(store, opts.partial === true),
    () => write_now(store, opts.partial === true)
  );
  write_tail = run.catch(() => {});
  return run;
}

async function write_now(store: menu_store, partial: boolean): Promise<void> {
  published_cache = null;
  if (is_supabase_configured()) {
    const admin = create_service_client();
    const previous = await read_published_menu();
    const durable = merge_stores(previous, store, partial);
    try {
      const { error } = await admin.from('menu_catalog').upsert(
        {
          id: catalog_row_id,
          store: durable,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (!error) {
        published_cache = { at: Date.now(), store: durable };
        // зеркало на диск — если supabase снова отвалится, сайт всё равно поднимется
        await write_json_store(store_key, durable).catch(() => {});
        return;
      }
      console.error('menu catalog write', error.message);
    } catch (e) {
      console.error(
        'menu catalog write',
        e instanceof Error ? e.message : e
      );
    }
    // supabase недоступен / таблица отсутствует — пишем локально, страницу не валим
    await write_json_store(store_key, durable);
    published_cache = { at: Date.now(), store: durable };
    return;
  }

  // локальный диск тоже мержим — иначе GET с дефолтом мог стереть кастомные позиции
  const previous = await read_fallback();
  const durable = merge_stores(previous, store, partial);
  await write_json_store(store_key, durable);
  published_cache = { at: Date.now(), store: durable };
}

export function is_menu_store_payload(value: unknown): value is menu_store {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<menu_store>;
  return Array.isArray(row.items) && Array.isArray(row.categories);
}
