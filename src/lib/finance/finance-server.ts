import { read_json_store, write_json_store } from '@/lib/data-store';
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
  if (!raw) return default_finance_state();
  const normalized = normalize_finance_state(raw);
  const durable = prune_stock_retention(normalized);
  if (raw_version(raw) < FINANCE_STATE_VERSION || stock_retention_changed(normalized, durable)) {
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
  const normalized = normalize_finance_state(raw);
  const durable = prune_stock_retention(normalized);
  if (raw_version(raw) < FINANCE_STATE_VERSION || stock_retention_changed(normalized, durable)) {
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

export async function write_finance_state(state: finance_state): Promise<void> {
  const durable = prune_stock_retention(normalize_finance_state(state));
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
