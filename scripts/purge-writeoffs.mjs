/**
 * Обнулить тестовые списания (writeoff) в finance_state + stock_audit.
 * Запуск: node --env-file=.env.local scripts/purge-writeoffs.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const table = 'finance_state';
const row_id = 'default';
const audit_table = 'stock_audit';
const audit_blob_id = 'stock_audit';

const { data, error } = await admin.from(table).select('store').eq('id', row_id).maybeSingle();
if (error) {
  console.error('read finance_state', error.message);
  process.exit(1);
}
if (!data?.store) {
  console.error('finance_state пуст');
  process.exit(1);
}

const store = data.store;
const movements = Array.isArray(store.stockMovements) ? store.stockMovements : [];
const writeoffs = movements.filter((m) => m?.type === 'writeoff');
const ids = new Set(writeoffs.map((m) => m.id));
const kept = movements.filter((m) => m?.type !== 'writeoff');
const audit = Array.isArray(store.stockAudit) ? store.stockAudit : [];
const audit_kept = audit.filter(
  (e) => e?.action !== 'writeoff' && !(e?.movementId && ids.has(e.movementId))
);

console.log(`writeoffs: ${writeoffs.length}, movements ${movements.length} → ${kept.length}`);

const next = { ...store, stockMovements: kept, stockAudit: audit_kept };
const { error: write_err } = await admin
  .from(table)
  .upsert({ id: row_id, store: next, updated_at: new Date().toISOString() }, { onConflict: 'id' });
if (write_err) {
  console.error('write finance_state', write_err.message);
  process.exit(1);
}

// зеркало в menu_catalog
await admin
  .from('menu_catalog')
  .upsert({ id: 'finance', store: next, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  .then(({ error: e }) => e && console.warn('menu_catalog mirror', e.message));

const { data: aud_rows } = await admin.from(audit_table).select('id').eq('action', 'writeoff');
if (aud_rows?.length) {
  const { error: del } = await admin
    .from(audit_table)
    .delete()
    .in(
      'id',
      aud_rows.map((r) => r.id)
    );
  console.log('stock_audit rows deleted', del ? del.message : aud_rows.length);
}

const { data: blob } = await admin.from(table).select('store').eq('id', audit_blob_id).maybeSingle();
if (blob?.store?.entries) {
  const entries = blob.store.entries.filter(
    (e) => e?.action !== 'writeoff' && !(e?.movementId && ids.has(e.movementId))
  );
  await admin.from(table).upsert(
    {
      id: audit_blob_id,
      store: { entries },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  console.log('audit blob', blob.store.entries.length, '→', entries.length);
}

console.log('ok — списания вычищены из supabase');
