import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { read_finance_state, write_finance_state } from '@/lib/finance/finance-server';
import { current_seller_access } from '@/lib/seller-access-server';
import { sum_order_revenue } from '@/lib/finance/order-revenue';
import {
  apply_adjust,
  apply_inventory_count,
  apply_writeoff,
  bind_spot,
  commit_spot,
  fifo_batches_map,
  next_lot_cost_per_base,
  resolve_stock_spot,
  material_excluded_from_warehouse,
  material_is_free,
  merge_stock_categories,
  moscow_today,
  needs_stock_count,
  stock_books_day,
  stock_levels,
  stock_qty_map,
  warehouse_money,
  writeoffs_money,
  type finance_state,
  type stock_category,
} from '@/lib/finance/model';
import { prep_station_views } from '@/lib/finance/prep-stations';

export const dynamic = 'force-dynamic';

function public_cats(state: finance_state): stock_category[] {
  return merge_stock_categories(state.stockCategories ?? []);
}

function public_rows(state: finance_state, with_money: boolean) {
  const cats = public_cats(state);
  const order = cats.map((c) => c.id);
  const lots = fifo_batches_map(state);
  return stock_levels(state)
    .filter((r) => r.material.name.trim() && !material_excluded_from_warehouse(r.material) && !material_is_free(r.material))
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
      /** ₽ за 1 базовую единицу следующей партии — для превью списания */
      costPerBase: Math.round(next_lot_cost_per_base(state, r.material.id) * 10_000) / 10_000,
      needsPrice:
        r.qty > 0.5 &&
        ((lots.get(r.material.id) ?? []).some((b) => b.qty > 0.5 && (b.unpriced || b.unit_cost <= 1e-9)) ||
          r.value <= 0.5),
      ...(r.material.tareWeight && r.material.tareWeight > 0 ? { tareWeight: r.material.tareWeight } : {}),
      ...(with_money ? { value: Math.round(r.value) } : {}),
    }));
}

async function payload(state: finance_state, with_money: boolean) {
  const today = moscow_today();
  const wm = warehouse_money(state, today);
  const wo = writeoffs_money(state, today);
  let earned: number | null = null;
  if (with_money) {
    try {
      const fact = await sum_order_revenue(stock_books_day(state) || '2024-01-01', today);
      earned = fact.revenue - wm.realized;
    } catch {
      earned = null;
    }
  }
  const money = with_money
    ? {
        on_hand: wm.on_hand,
        spent: wm.spent,
        realized: wm.realized,
        lost: wm.lost,
        earned,
        writeoffs_sum: wo.sum,
        writeoffs_count: wo.count,
      }
    : null;
  return {
    must_count: needs_stock_count(state),
    counted_at: state.stockCountedAt ?? null,
    categories: public_cats(state).map((c) => ({ id: c.id, name: c.name, color: c.color })),
    rows: public_rows(state, with_money),
    money,
    /** всегда — даже без stock_money */
    lost: wm.lost,
    writeoffs_sum: wo.sum,
    writeoffs_count: wo.count,
    prep_stations: prep_station_views(state),
  };
}

export async function GET(request: Request) {
  const access = await current_seller_access();
  if (!access?.stock) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const spot = resolve_stock_spot(new URL(request.url).searchParams.get('spot_id'));
  const state = bind_spot(await read_finance_state(), spot);
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
  tares?: { materialId?: string; tare?: number }[];
};

type writeoff_body = {
  kind: 'writeoff';
  materialId?: string;
  qty?: number;
  note?: string;
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
  const spot = resolve_stock_spot(
    typeof (body as { spot_id?: unknown }).spot_id === 'string' ? (body as { spot_id: string }).spot_id : ''
  );
  const date = new Date().toISOString();
  const full = await read_finance_state();
  const state = bind_spot(full, spot);
  let next: finance_state = state;

  if (kind === 'adjust') {
    const b = body as adjust_body;
    const materialId = String(b.materialId || '');
    const qty = Number(b.qty);
    if (!materialId || !Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ error: 'нужны позиция и количество' }, { status: 400 });
    }
    const mat = state.materials.find((m) => m.id === materialId);
    if (!mat || material_excluded_from_warehouse(mat) || material_is_free(mat)) {
      return NextResponse.json({ error: 'позиция не найдена' }, { status: 404 });
    }
    next = apply_adjust(state, materialId, qty, b.note?.trim() || 'правка кассы', date, actor, 'adjust');
  } else if (kind === 'inventory') {
    const b = body as inventory_body;
    const facts = (b.facts ?? [])
      .map((f) => ({ materialId: String(f.materialId || ''), qty: Number(f.qty) }))
      .filter((f) => f.materialId && Number.isFinite(f.qty) && f.qty >= 0);
    const tare_by_id = new Map<string, number>();
    for (const row of b.tares ?? []) {
      const id = String(row.materialId || '');
      const tare = Number(row.tare);
      if (!id || !Number.isFinite(tare) || tare <= 0) continue;
      tare_by_id.set(id, tare);
    }
    const with_tare = tare_by_id.size
      ? {
          ...state,
          materials: state.materials.map((m) =>
            tare_by_id.has(m.id) ? { ...m, tareWeight: tare_by_id.get(m.id) } : m
          ),
        }
      : state;
    next = apply_inventory_count(with_tare, facts, date, actor);
  } else if (kind === 'writeoff') {
    const b = body as writeoff_body;
    const materialId = String(b.materialId || '');
    const qty = Math.round(Number(b.qty));
    if (!materialId || !Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'укажите сколько списать' }, { status: 400 });
    }
    const mat = state.materials.find((m) => m.id === materialId);
    if (!mat || material_excluded_from_warehouse(mat) || material_is_free(mat)) {
      return NextResponse.json({ error: 'позиция не найдена' }, { status: 404 });
    }
    const on_hand = stock_qty_map(state).get(materialId) ?? 0;
    if (qty > on_hand + 0.5) {
      return NextResponse.json(
        { error: `нельзя списать больше остатка (${Math.round(on_hand)})` },
        { status: 400 }
      );
    }
    next = apply_writeoff(
      state,
      materialId,
      qty,
      b.note?.trim() || 'списание кассы',
      date,
      actor
    );
  } else {
    return NextResponse.json({ error: 'неизвестное действие' }, { status: 400 });
  }

  const merged = commit_spot(full, spot, next);
  try {
    await write_finance_state(merged);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ошибка записи' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ...(await payload(bind_spot(merged, spot), access.stock_money)) });
}
