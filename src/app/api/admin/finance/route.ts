import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import { merge_stock_audit, read_stock_audit } from '@/lib/finance/stock-audit';
import { filter_stock_audit, normalize_finance_state, sync_tech_cards_with_menu } from '@/lib/finance/model';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { read_published_menu } from '@/lib/menu-catalog-server';
import type { menu_item } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

async function load_menu_items(): Promise<menu_item[]> {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    return merge_menu_item_catalog(stored.items, stored.removed_item_ids ?? []);
  }
  return get_default_store().items;
}

/** состояние финансов + меню (для связки техкарт) */
export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const [state, menu, table_audit] = await Promise.all([
    read_finance_state(),
    load_menu_items(),
    read_stock_audit(),
  ]);
  const synced = sync_tech_cards_with_menu(state, menu);
  const with_audit = {
    ...synced,
    stockAudit: filter_stock_audit(merge_stock_audit(table_audit, synced.stockAudit)),
  };
  const changed = JSON.stringify(synced) !== JSON.stringify(state);
  if (changed) {
    try {
      await write_finance_state(synced);
    } catch (e) {
      console.error('finance sync write', e);
    }
  }
  return NextResponse.json(
    { state: with_audit, menu },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }
  const payload = (body as { state?: unknown })?.state ?? body;
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'нет данных' }, { status: 400 });
  }
  const incoming = normalize_finance_state(payload);
  const [cloud, table_audit] = await Promise.all([read_finance_state(), read_stock_audit()]);
  const state = {
    ...incoming,
    stockAudit: filter_stock_audit(merge_stock_audit(table_audit, [...(cloud.stockAudit ?? []), ...(incoming.stockAudit ?? [])])),
  };
  try {
    await write_finance_state(state);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ошибка записи' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
