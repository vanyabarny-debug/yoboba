import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import {
  delete_writeoff_audits,
  merge_stock_audit,
  read_stock_audit,
} from '@/lib/finance/stock-audit';
import {
  filter_stock_audit,
  moscow_today,
  normalize_finance_state,
  purge_writeoff_movements,
  sync_tech_cards_with_menu,
  warehouse_money,
  writeoffs_money,
} from '@/lib/finance/model';
import { ensure_prep_materials } from '@/lib/finance/prep-stations';
import { upgrade_menu_store } from '@/lib/menu-store';
import { read_published_menu } from '@/lib/menu-catalog-server';
import type { menu_item } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

async function load_menu_items(): Promise<menu_item[]> {
  return upgrade_menu_store(await read_published_menu()).items;
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
  const incoming = ensure_prep_materials(normalize_finance_state(payload));
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

/** служебные действия: обнулить тестовые списания */
export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }
  const kind = (body as { kind?: string })?.kind;
  if (kind !== 'purge_writeoffs') {
    return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
  }

  const state = await read_finance_state();
  const before_wo = writeoffs_money(state);
  const before_lost = warehouse_money(state).lost;
  const { state: next, removed, movementIds } = purge_writeoff_movements(state);
  try {
    await write_finance_state(next);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ошибка записи' }, { status: 500 });
  }
  const audit_deleted = await delete_writeoff_audits(movementIds);
  const today = moscow_today();
  const after_wo = writeoffs_money(next, today);
  const after_lost = warehouse_money(next, today).lost;
  return NextResponse.json({
    ok: true,
    removed,
    audit_deleted,
    writeoffs_before: before_wo.sum,
    writeoffs_after: after_wo.sum,
    lost_before: before_lost,
    lost_after: after_lost,
  });
}
