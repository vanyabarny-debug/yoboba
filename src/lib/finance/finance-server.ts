import { read_json_store, write_json_store } from '@/lib/data-store';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { persist_stock_audit } from '@/lib/finance/stock-audit';
import { ensure_finance_cloud_once } from '@/lib/finance/ensure-cloud';
import { note_table_error, table_is_missing } from '@/lib/supabase/schema-cache';
import {
  default_finance_state,
  FINANCE_STATE_VERSION,
  normalize_finance_state,
  prune_stock_retention,
  stock_retention_changed,
  type finance_state,
} from '@/lib/finance/model';
import { ensure_prep_materials } from '@/lib/finance/prep-stations';

function finalize_finance(raw: unknown): finance_state {
  return ensure_prep_materials(normalize_finance_state(raw));
}

const table = 'finance_state';
const row_id = 'default';
/** старое место — оставляем как зеркало, пока миграция не везде прогнана */
const catalog_row_id = 'finance';
const store_key = 'finance-state';

type store_row = { store: unknown };

function raw_version(raw: unknown) {
  if (!raw || typeof raw !== 'object') return 0;
  const n = Number((raw as { version?: unknown }).version);
  return Number.isFinite(n) ? n : 0;
}

async function read_fallback(): Promise<finance_state> {
  const raw = await read_json_store<unknown>(store_key, null);
  if (!raw) return ensure_prep_materials(default_finance_state());
  const normalized = finalize_finance(raw);
  const durable = prune_stock_retention(normalized);
  if (
    raw_version(raw) < FINANCE_STATE_VERSION ||
    stock_retention_changed(normalized, durable) ||
    !Boolean((raw as { prepStockMigrated?: unknown })?.prepStockMigrated)
  ) {
    await write_json_store(store_key, durable).catch(() => {});
  }
  return durable;
}

async function read_row(
  admin: ReturnType<typeof create_service_client>,
  from: string,
  id: string
): Promise<finance_state | null> {
  if (table_is_missing(from)) return null;
  const { data, error } = await admin.from(from).select('store').eq('id', id).maybeSingle();
  if (error) {
    if (!note_table_error(from, error.message)) {
      console.error(`finance read ${from}`, error.message);
    }
    return null;
  }
  if (!data?.store) return null;
  const raw = (data as store_row).store;
  const normalized = finalize_finance(raw);
  const durable = prune_stock_retention(normalized);
  if (
    raw_version(raw) < FINANCE_STATE_VERSION ||
    stock_retention_changed(normalized, durable) ||
    !Boolean((raw as { prepStockMigrated?: unknown })?.prepStockMigrated)
  ) {
    await write_row(admin, from, id, durable);
    if (from === table) {
      await write_row(admin, 'menu_catalog', catalog_row_id, durable);
      void persist_stock_audit([]).catch((e) => console.error('stock_audit prune', e));
    }
  }
  return durable;
}

async function write_row(
  admin: ReturnType<typeof create_service_client>,
  from: string,
  id: string,
  store: finance_state
): Promise<boolean> {
  if (table_is_missing(from)) return false;
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from(from).upsert(
      { id, store, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (!error) return true;
    last = error.message || String(error);
    if (note_table_error(from, last)) return false;
    const transient = /fetch failed|network|timeout|ECONNRESET|socket/i.test(last);
    if (!transient) {
      console.error(`finance write ${from}`, last);
      return false;
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  console.error(`finance write ${from}`, last);
  return false;
}

export async function read_finance_state(): Promise<finance_state> {
  if (is_supabase_configured()) {
    await ensure_finance_cloud_once().catch(() => {});
    const admin = create_service_client();
    const primary = await read_row(admin, table, row_id);
    if (primary) return primary;
    const legacy = await read_row(admin, 'menu_catalog', catalog_row_id);
    if (legacy) {
      if (!table_is_missing(table)) await write_row(admin, table, row_id, legacy);
      return legacy;
    }
  }
  return read_fallback();
}

async function sync_tech_card_temps(state: finance_state): Promise<void> {
  const tagged = state.techCards.filter(
    (card) => card.menu_item_id && (typeof card.cold === 'boolean' || typeof card.hot === 'boolean')
  );
  if (!tagged.length) return;
  const menu = await read_published_menu();
  if (!menu?.items?.length) return;
  const by_menu = new Map(tagged.map((card) => [card.menu_item_id as string, card]));
  let changed = false;
  const items = menu.items.map((item) => {
    const card = by_menu.get(item.id);
    if (!card) return item;
    const cold = typeof card.cold === 'boolean' ? card.cold : item.cold;
    const hot = typeof card.hot === 'boolean' ? card.hot : item.hot;
    if (item.cold === cold && item.hot === hot) return item;
    changed = true;
    return { ...item, cold, hot };
  });
  if (!changed) return;
  await write_published_menu({ ...menu, items });
}

let finance_tail: Promise<void> = Promise.resolve();

/** одна очередь на процесс, чтобы варка и заказ не затирали друг друга */
function enqueue_finance<T>(job: () => Promise<T>): Promise<T> {
  const run = finance_tail.then(job, job);
  finance_tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function read_cloud_pair(): Promise<{ state: finance_state; updatedAt: string | null } | null> {
  if (!is_supabase_configured()) return null;
  const admin = create_service_client();
  const { data, error } = await admin.from(table).select('store, updated_at').eq('id', row_id).maybeSingle();
  if (error || !data) return null;
  const row = data as { store?: unknown; updated_at?: string | null };
  if (!row.store) return null;
  return {
    state: prune_stock_retention(finalize_finance(row.store)),
    updatedAt: row.updated_at || null,
  };
}

async function write_finance_cas(
  state: finance_state,
  expected_updated_at: string | null,
  previous?: finance_state | null
): Promise<'ok' | 'conflict' | 'fail'> {
  const durable = prune_stock_retention(finalize_finance(state));
  await sync_tech_card_temps(durable);
  if (!is_supabase_configured()) {
    await write_json_store(store_key, durable);
    return 'ok';
  }
  const admin = create_service_client();
  const next_stamp = new Date().toISOString();
  let query = admin.from(table).update({ store: durable, updated_at: next_stamp }).eq('id', row_id);
  if (expected_updated_at) query = query.eq('updated_at', expected_updated_at);
  const { data, error } = await query.select('id');
  if (error) {
    if (note_table_error(table, error.message)) return 'fail';
    console.error('finance cas', error.message);
    return 'fail';
  }
  if (!data?.length) return 'conflict';
  await write_row(admin, 'menu_catalog', catalog_row_id, durable);
  await write_json_store(store_key, durable).catch(() => {});
  const prev_ids = new Set((previous?.stockAudit ?? []).map((entry) => entry.id));
  const added = (durable.stockAudit ?? []).filter((entry) => !prev_ids.has(entry.id));
  if (added.length) {
    void persist_stock_audit(added).catch((e) => console.error('stock_audit persist', e));
  }
  return 'ok';
}

/**
 * прочитать склад, поменять, записать.
 * если за это время кто-то успел сохранить свою версию — читаем заново и повторяем.
 */
export async function mutate_finance_state<T>(
  fn: (state: finance_state) => { state: finance_state | null; value: T } | Promise<{ state: finance_state | null; value: T }>
): Promise<T> {
  return enqueue_finance(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cloud = await read_cloud_pair();
      const state = cloud?.state ?? (await read_finance_state());
      const stamp = cloud?.updatedAt ?? null;
      const result = await fn(state);
      if (!result.state) return result.value;
      const wrote = await write_finance_cas(result.state, stamp, state);
      if (wrote === 'ok') return result.value;
      if (wrote === 'fail') throw new Error('не удалось записать склад');
    }
    throw new Error('склад только что изменился, повторите');
  });
}

export async function write_finance_state(state: finance_state): Promise<void> {
  return enqueue_finance(() => write_finance_state_unlocked(state));
}

async function write_finance_state_unlocked(state: finance_state): Promise<void> {
  const durable = prune_stock_retention(finalize_finance(state));
  await sync_tech_card_temps(durable);
  const local = write_json_store(store_key, durable).catch(() => {});
  if (!is_supabase_configured()) {
    await local;
    return;
  }
  const admin = create_service_client();
  const prev =
    (await read_row(admin, table, row_id)) ||
    (await read_row(admin, 'menu_catalog', catalog_row_id));
  const prev_ids = new Set((prev?.stockAudit ?? []).map((e) => e.id));
  const writes: Promise<boolean>[] = [write_row(admin, 'menu_catalog', catalog_row_id, durable)];
  if (!table_is_missing(table)) writes.unshift(write_row(admin, table, row_id, durable));
  const results = await Promise.all(writes);
  if (!results.some(Boolean)) {
    await local;
    throw new Error('не удалось записать склад в supabase');
  }
  const added = (durable.stockAudit ?? []).filter((e) => !prev_ids.has(e.id));
  if (added.length) {
    void persist_stock_audit(added).catch((e) =>
      console.error('stock_audit persist', e instanceof Error ? e.message : e)
    );
  }
  await local;
}
