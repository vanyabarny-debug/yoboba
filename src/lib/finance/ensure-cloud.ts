import { is_supabase_configured } from '@/lib/supabase/config';
import { mark_table_present, note_table_error } from '@/lib/supabase/schema-cache';
import { create_service_client } from '@/lib/supabase/service';

const finance_table = 'finance_state';
const catalog_table = 'menu_catalog';
const audit_table = 'stock_audit';

const blob_keys = [
  'cash-transactions',
  'prep-events',
  'fulfillment-events',
  'handed-orders',
] as const;

export type cloud_migrate_report = {
  finance_state: boolean;
  stock_audit: boolean;
  copied: string[];
  audit_copied: number;
  error?: string;
};

type catalog_row = { id: string; store: unknown; updated_at?: string };

async function table_ready(
  admin: ReturnType<typeof create_service_client>,
  name: string
): Promise<boolean> {
  const { error } = await admin.from(name).select('id').limit(1);
  if (!error) {
    mark_table_present(name);
    return true;
  }
  note_table_error(name, error.message);
  return false;
}

function audit_rows_from_finance(store: unknown) {
  if (!store || typeof store !== 'object') return [];
  const raw = (store as { stockAudit?: unknown }).stockAudit;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const e = row as Record<string, unknown>;
      const id = String(e.id || '');
      if (!id) return null;
      return {
        id,
        at: String(e.at || new Date().toISOString()),
        actor_id: String(e.actorId || e.actor_id || 'unknown'),
        actor_name: String(e.actorName || e.actor_name || 'неизвестно'),
        actor_role: e.actorRole === 'seller' || e.actor_role === 'seller' ? 'seller' : 'admin',
        action: String(e.action || 'adjust'),
        material_id: e.materialId != null ? String(e.materialId) : e.material_id != null ? String(e.material_id) : null,
        material_name:
          e.materialName != null ? String(e.materialName) : e.material_name != null ? String(e.material_name) : null,
        qty_before: e.qtyBefore != null ? Number(e.qtyBefore) : e.qty_before != null ? Number(e.qty_before) : null,
        qty_after: e.qtyAfter != null ? Number(e.qtyAfter) : e.qty_after != null ? Number(e.qty_after) : null,
        note: e.note != null ? String(e.note) : null,
        movement_id:
          e.movementId != null ? String(e.movementId) : e.movement_id != null ? String(e.movement_id) : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

/** если finance_state уже создали — копируем jsonb из menu_catalog, меню не трогаем */
export async function ensure_finance_cloud(): Promise<cloud_migrate_report> {
  const empty: cloud_migrate_report = {
    finance_state: false,
    stock_audit: false,
    copied: [],
    audit_copied: 0,
  };
  if (!is_supabase_configured()) {
    return { ...empty, error: 'supabase не настроен' };
  }

  const admin = create_service_client();
  const finance_ok = await table_ready(admin, finance_table);
  const audit_ok = await table_ready(admin, audit_table);
  const report: cloud_migrate_report = {
    ...empty,
    finance_state: finance_ok,
    stock_audit: audit_ok,
  };

  if (!finance_ok) {
    report.error = 'таблицы finance_state ещё нет — выполни supabase/finance-cloud.sql в SQL Editor';
    return report;
  }

  const { data: existing, error: exist_err } = await admin.from(finance_table).select('id');
  if (exist_err) {
    report.error = exist_err.message;
    return report;
  }
  const have = new Set((existing || []).map((r) => String((r as { id: string }).id)));

  const { data: catalog, error: cat_err } = await admin
    .from(catalog_table)
    .select('id, store, updated_at')
    .in('id', ['finance', ...blob_keys]);
  if (cat_err) {
    report.error = cat_err.message;
    return report;
  }

  for (const row of (catalog || []) as catalog_row[]) {
    const id = row.id === 'finance' ? 'default' : row.id;
    if (have.has(id) || row.store == null) continue;
    const { error } = await admin.from(finance_table).upsert(
      {
        id,
        store: row.store,
        updated_at: row.updated_at || new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      report.error = error.message;
      return report;
    }
    have.add(id);
    report.copied.push(id);
  }

  if (audit_ok) {
    const finance = ((catalog || []) as catalog_row[]).find((r) => r.id === 'finance');
    const rows = audit_rows_from_finance(finance?.store);
    if (rows.length) {
      const { error } = await admin.from(audit_table).upsert(rows, { onConflict: 'id' });
      if (error) {
        report.error = error.message;
        return report;
      }
      report.audit_copied = rows.length;
    }
  }

  return report;
}

let inflight: Promise<cloud_migrate_report> | null = null;

export function ensure_finance_cloud_once() {
  if (!inflight) {
    inflight = ensure_finance_cloud().finally(() => {
      setTimeout(() => {
        inflight = null;
      }, 30_000);
    });
  }
  return inflight;
}
