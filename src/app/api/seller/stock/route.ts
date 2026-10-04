import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import { current_seller_access } from '@/lib/seller-access-server';
import { sum_order_revenue } from '@/lib/finance/order-revenue';
import {
  apply_adjust,
  apply_inventory_count,
  material_is_infinite,
  merge_stock_categories,
  moscow_today,
  needs_stock_count,
  stock_levels,
  warehouse_money,
  type finance_state,
  type stock_category,
} from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

function public_cats(state: finance_state): stock_category[] {
  return merge_stock_categories(state.stockCategories ?? []);
}

function public_rows(state: finance_state, with_money: boolean) {
  const cats = public_cats(state);
  const order = cats.map((c) => c.id);
  return stock_levels(state)
    .filter((r) => r.material.name.trim() && !material_is_infinite(r.material))
    .sort((a, b) => {
      const ia = order.indexOf(a.material.category);
      const ib = order.indexOf(b.material.category);
      const ca = ia < 0 ? 999 : ia;
      const cb = ib < 0 ? 999 : ib;
      if (ca !== cb) return ca - cb;
      return a.material.name.localeCompare(b.material.name, 'ru');
    })
    .map((r) => ({
      id: r.material.id,
      name: r.material.name,
      category: r.material.category,
      unit: r.material.unit,
      qty: r.qty,
      low: r.low,
      ...(with_money ? { value: Math.round(r.value) } : {}),
    }));
}

async function payload(state: finance_state, with_money: boolean) {
  const today = moscow_today();
  let earned: number | null = null;
  if (with_money) {
    try {
      const fact = await sum_order_revenue('2024-01-01', today);
      earned = fact.revenue - warehouse_money(state, today).realized;
    } catch {
      earned = null;
    }
  }
  const money = with_money ? { ...warehouse_money(state, today), earned } : null;
  return {
    must_count: needs_stock_count(state),
    counted_at: state.stockCountedAt ?? null,
    categories: public_cats(state).map((c) => ({ id: c.id, name: c.name, color: c.color })),
    rows: public_rows(state, with_money),
    money,
  };
}

export async function GET() {
  const access = await current_seller_access();
  if (!access?.stock) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const state = await read_finance_state();
  return NextResponse.json(await payload(state, access.stock_money), {
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });
}

type adjust_body = {
  kind: 'adjust';
  materialId?: string;
  qty?: number;
  note?: string;
};

type inventory_body = {
  kind: 'inventory';
  facts?: { materialId?: string; qty?: number }[];
};

export async function POST(request: Request) {
  const access = await current_seller_access();
  if (!access?.stock) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'склад пишется только в supabase' }, { status: 503 });
  }

  const actor = await staff_actor();
  if (!actor) {
    return NextResponse.json({ error: 'нет автора' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }

  const kind = (body as { kind?: string })?.kind;
  const date = new Date().toISOString();
  const state = await read_finance_state();
  let next: finance_state = state;

  if (kind === 'adjust') {
    const b = body as adjust_body;
    const materialId = String(b.materialId || '');
    const qty = Number(b.qty);
    if (!materialId || !Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ error: 'нужны позиция и количество' }, { status: 400 });
    }
    const mat = state.materials.find((m) => m.id === materialId);
    if (!mat || material_is_infinite(mat)) {
      return NextResponse.json({ error: 'позиция не найдена' }, { status: 404 });
    }
    next = apply_adjust(state, materialId, qty, b.note?.trim() || 'правка кассы', date, actor, 'adjust');
  } else if (kind === 'inventory') {
    const b = body as inventory_body;
    const facts = (b.facts ?? [])
      .map((f) => ({ materialId: String(f.materialId || ''), qty: Number(f.qty) }))
      .filter((f) => f.materialId && Number.isFinite(f.qty) && f.qty >= 0);
    next = apply_inventory_count(state, facts, date, actor);
  } else {
    return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
  }

  try {
    await write_finance_state(next);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ошибка записи' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ...(await payload(next, access.stock_money)) });
}
