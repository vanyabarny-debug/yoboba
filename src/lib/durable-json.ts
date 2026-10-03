import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import { is_supabase_configured } from '@/lib/supabase/config';
import { ensure_finance_cloud_once } from '@/lib/finance/ensure-cloud';
import { note_table_error, table_is_missing } from '@/lib/supabase/schema-cache';
import { create_service_client } from '@/lib/supabase/service';

const table = 'finance_state';
const legacy_table = 'menu_catalog';

function has_rows<T>(value: T, fallback: T) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return JSON.stringify(value) !== JSON.stringify(fallback);
  return value != null && value !== fallback;
}

async function read_row(
  admin: ReturnType<typeof create_service_client>,
  from: string,
  key: string
): Promise<{ store: unknown } | null | 'missing'> {
  if (table_is_missing(from)) return 'missing';
  const { data, error } = await admin.from(from).select('store').eq('id', key).maybeSingle();
  if (error) {
    if (note_table_error(from, error.message)) return 'missing';
    console.error(`durable read ${from}/${key}`, error.message);
    return null;
  }
  if (data?.store == null) return null;
  return { store: data.store };
}

async function upsert_row(
  admin: ReturnType<typeof create_service_client>,
  from: string,
  key: string,
  value: unknown
): Promise<'ok' | 'missing' | 'fail'> {
  if (table_is_missing(from)) return 'missing';
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from(from).upsert(
      { id: key, store: value, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (!error) return 'ok';
    last = error.message || String(error);
    if (note_table_error(from, last)) return 'missing';
    const transient = /fetch failed|network|timeout|ECONNRESET|socket/i.test(last);
    if (!transient) {
      console.error(`durable write ${from}/${key}`, last);
      return 'fail';
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  console.error(`durable write ${from}/${key}`, last);
  return 'fail';
}

/** продажи / выдачи / касса живут в supabase jsonb, диск — только зеркало */
export async function read_durable_json<T>(key: string, fallback: T): Promise<T> {
  const local = await read_json_store<T>(key, fallback);
  if (!is_supabase_configured()) return local;
  await ensure_finance_cloud_once().catch(() => {});
  const admin = create_service_client();
  const primary = await read_row(admin, table, key);
  const cloud =
    primary === 'missing' || primary == null ? await read_row(admin, legacy_table, key) : primary;
  const store = cloud && cloud !== 'missing' ? (cloud.store as T) : null;
  if (store == null) {
    if (has_rows(local, fallback)) {
      await write_durable_json(key, local).catch((e) =>
        console.error(`durable migrate ${key}`, e instanceof Error ? e.message : e)
      );
    }
    return local;
  }
  return store;
}

export async function write_durable_json<T>(key: string, value: T): Promise<void> {
  const local = write_json_store(key, value).catch(() => {});
  if (!is_supabase_configured()) {
    await local;
    return;
  }
  const admin = create_service_client();
  const cloud = (async () => {
    if (!table_is_missing(table)) {
      const primary = await upsert_row(admin, table, key, value);
      if (primary === 'ok') return;
      if (primary === 'fail') {
        const legacy = await upsert_row(admin, legacy_table, key, value);
        if (legacy === 'ok') return;
        throw new Error('не удалось записать в supabase');
      }
    }
    const legacy = await upsert_row(admin, legacy_table, key, value);
    if (legacy === 'ok' || legacy === 'missing') return;
    throw new Error('не удалось записать в supabase');
  })();
  await Promise.all([local, cloud]);
}

export function keep_since_day(months = 3, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return moscow_today_iso(d);
}
