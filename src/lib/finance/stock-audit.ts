import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { note_table_error, table_is_missing } from '@/lib/supabase/schema-cache';
import { filter_stock_audit, stock_keep_since_iso, type stock_audit_entry } from '@/lib/finance/model';

function parse_blob(store: unknown): stock_audit_entry[] {
  if (!store || typeof store !== 'object') return [];
  const entries = (store as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const s = row as Partial<stock_audit_entry>;
      return {
        id: String(s.id || ''),
        at: String(s.at || ''),
        actorId: String(s.actorId || 'unknown'),
        actorName: String(s.actorName || 'неизвестно'),
        actorRole: s.actorRole === 'seller' ? 'seller' : 'admin',
        action:
          s.action === 'inventory' || s.action === 'writeoff' || s.action === 'receipt' || s.action === 'delete_movement'
            ? s.action
            : 'adjust',
        ...(s.materialId ? { materialId: String(s.materialId) } : {}),
        ...(s.materialName ? { materialName: String(s.materialName) } : {}),
        ...(s.qtyBefore != null ? { qtyBefore: Number(s.qtyBefore) } : {}),
        ...(s.qtyAfter != null ? { qtyAfter: Number(s.qtyAfter) } : {}),
        ...(s.note ? { note: String(s.note) } : {}),
        ...(s.movementId ? { movementId: String(s.movementId) } : {}),
      } as stock_audit_entry;
    })
    .filter((e) => e.id && e.at);
}

const table = 'stock_audit';
const blob_table = 'finance_state';
const blob_id = 'stock_audit';

type audit_row = {
  id: string;
  at: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  material_id: string | null;
  material_name: string | null;
  qty_before: number | null;
  qty_after: number | null;
  note: string | null;
  movement_id: string | null;
};

function to_row(e: stock_audit_entry): audit_row {
  return {
    id: e.id,
    at: e.at,
    actor_id: e.actorId,
    actor_name: e.actorName,
    actor_role: e.actorRole,
    action: e.action,
    material_id: e.materialId ?? null,
    material_name: e.materialName ?? null,
    qty_before: e.qtyBefore ?? null,
    qty_after: e.qtyAfter ?? null,
    note: e.note ?? null,
    movement_id: e.movementId ?? null,
  };
}

function from_row(r: audit_row): stock_audit_entry {
  return {
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role === 'seller' ? 'seller' : 'admin',
    action:
      r.action === 'inventory' || r.action === 'writeoff' || r.action === 'receipt' || r.action === 'delete_movement'
        ? r.action
        : 'adjust',
    ...(r.material_id ? { materialId: r.material_id } : {}),
    ...(r.material_name ? { materialName: r.material_name } : {}),
    ...(r.qty_before != null ? { qtyBefore: Number(r.qty_before) } : {}),
    ...(r.qty_after != null ? { qtyAfter: Number(r.qty_after) } : {}),
    ...(r.note ? { note: r.note } : {}),
    ...(r.movement_id ? { movementId: r.movement_id } : {}),
  };
}

function missing_table(message: string | undefined) {
  return /does not exist|schema cache|could not find the table/i.test(message || '');
}

async function persist_audit_blob(entries: stock_audit_entry[]) {
  if (!entries.length || table_is_missing(blob_table)) return;
  const admin = create_service_client();
  const { data, error } = await admin.from(blob_table).select('store').eq('id', blob_id).maybeSingle();
  if (error) {
    if (note_table_error(blob_table, error.message)) return;
    console.error('stock_audit blob read', error.message);
  }
  const prev = parse_blob((data as { store?: unknown } | null)?.store);
  const by_id = new Map(prev.map((e) => [e.id, e]));
  for (const e of entries) by_id.set(e.id, e);
  const since = stock_keep_since_iso();
  const all = [...by_id.values()]
    .filter((e) => e.at >= since)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const { error: write_error } = await admin.from(blob_table).upsert(
    { id: blob_id, store: { entries: all }, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (write_error) {
    if (note_table_error(blob_table, write_error.message)) return;
    console.error('stock_audit blob write', write_error.message);
  }
}

async function persist_audit_table(entries: stock_audit_entry[]) {
  const fresh = filter_stock_audit(entries);
  if (!fresh.length || table_is_missing(table)) return;
  const admin = create_service_client();
  const { error } = await admin.from(table).upsert(fresh.map(to_row), { onConflict: 'id' });
  if (error && !note_table_error(table, error.message) && !missing_table(error.message)) {
    console.error('stock_audit write', error.message);
  }
}

async function prune_stock_audit_cloud(): Promise<void> {
  if (!is_supabase_configured()) return;
  const since = stock_keep_since_iso();
  const admin = create_service_client();
  const { data, error } = await admin.from(blob_table).select('store').eq('id', blob_id).maybeSingle();
  if (!error) {
    const prev = parse_blob((data as { store?: unknown } | null)?.store);
    const kept = prev.filter((e) => e.at >= since);
    if (kept.length !== prev.length) {
      const { error: write_error } = await admin.from(blob_table).upsert(
        { id: blob_id, store: { entries: kept }, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
      if (write_error) console.error('stock_audit blob prune', write_error.message);
    }
  } else if (!missing_table(error.message)) {
    console.error('stock_audit blob prune read', error.message);
  }
  const { error: del_error } = await admin.from(table).delete().lt('at', since);
  if (del_error && !missing_table(del_error.message)) {
    console.error('stock_audit prune', del_error.message);
  }
}

export async function persist_stock_audit(entries: stock_audit_entry[]): Promise<void> {
  if (!is_supabase_configured() || !entries.length) return;
  await persist_audit_table(entries);
  await persist_audit_blob(entries);
}

async function read_audit_blob(): Promise<stock_audit_entry[]> {
  const admin = create_service_client();
  const { data, error } = await admin.from(blob_table).select('store').eq('id', blob_id).maybeSingle();
  if (error) {
    if (!missing_table(error.message)) console.error('stock_audit blob read', error.message);
    return [];
  }
  return parse_blob((data as { store?: unknown } | null)?.store);
}

async function read_audit_table(limit: number): Promise<stock_audit_entry[]> {
  const admin = create_service_client();
  const { data, error } = await admin
    .from(table)
    .select(
      'id, at, actor_id, actor_name, actor_role, action, material_id, material_name, qty_before, qty_after, note, movement_id'
    )
    .gte('at', stock_keep_since_iso())
    .order('at', { ascending: false })
    .limit(limit);
  if (error) {
    if (!missing_table(error.message)) console.error('stock_audit read', error.message);
    return [];
  }
  return ((data || []) as audit_row[]).map(from_row);
}

export async function read_stock_audit(limit = 400): Promise<stock_audit_entry[] | null> {
  if (!is_supabase_configured()) return null;
  const [blob, rows] = await Promise.all([read_audit_blob(), read_audit_table(limit)]);
  if (!blob.length && !rows.length) return [];
  return filter_stock_audit(merge_stock_audit(rows, blob)).slice(0, limit);
}

export function merge_stock_audit(
  table_rows: stock_audit_entry[] | null | undefined,
  embedded: stock_audit_entry[] | undefined
): stock_audit_entry[] {
  const by_id = new Map<string, stock_audit_entry>();
  for (const row of embedded ?? []) by_id.set(row.id, row);
  for (const row of table_rows ?? []) by_id.set(row.id, row);
  return [...by_id.values()].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
