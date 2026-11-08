import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import {
  apply_writeoff,
  bind_spot,
  commit_spot,
  format_base_qty,
  material_excluded_from_warehouse,
  material_is_free,
  material_is_infinite,
  resolve_stock_spot,
  stock_category_for,
  stock_qty_map,
} from '@/lib/finance/model';
import { clear_station_clock } from '@/lib/finance/prep-stations';

export const dynamic = 'force-dynamic';

function rows_of(state: ReturnType<typeof bind_spot>) {
  const qty = stock_qty_map(state);
  return state.materials
    .filter(
      (m) =>
        m.name.trim() &&
        !material_excluded_from_warehouse(m) &&
        !material_is_free(m) &&
        !material_is_infinite(m)
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      category: stock_category_for(m),
      qty: qty.get(m.id) ?? 0,
      qtyLabel: format_base_qty(m, qty.get(m.id) ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function GET(request: Request) {
  if (!(await staff_actor())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const spot = resolve_stock_spot(new URL(request.url).searchParams.get('spot_id'));
  const state = bind_spot(await read_finance_state(), spot);
  return NextResponse.json(
    { rows: rows_of(state) },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}

export async function POST(request: Request) {
  const actor = await staff_actor();
  if (!actor) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'склад пишется только в supabase' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }
  const rec = body as { materialId?: unknown; qty?: unknown; note?: unknown; spot_id?: unknown };
  const materialId = typeof rec.materialId === 'string' ? rec.materialId.trim() : '';
  const qty = Math.round(Number(rec.qty));
  const note = typeof rec.note === 'string' && rec.note.trim() ? rec.note.trim().slice(0, 140) : 'списание кассы';
  const spot = resolve_stock_spot(typeof rec.spot_id === 'string' ? rec.spot_id : '');
  if (!materialId || !Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: 'укажите сколько списать' }, { status: 400 });
  }

  try {
    const saved = await mutate_finance_state<
      { ok: false; error: string } | { ok: true; rows: ReturnType<typeof rows_of> }
    >((full) => {
      const state = bind_spot(full, spot);
      const mat = state.materials.find((m) => m.id === materialId);
      if (!mat || material_excluded_from_warehouse(mat) || material_is_free(mat) || material_is_infinite(mat)) {
        return { state: null, value: { ok: false, error: 'позиция не найдена' } };
      }
      const on_hand = stock_qty_map(state).get(materialId) ?? 0;
      if (on_hand <= 0.5) {
        return { state: null, value: { ok: false, error: 'на складе пусто' } };
      }
      if (qty > on_hand + 0.5) {
        return {
          state: null,
          value: { ok: false, error: `нельзя списать больше остатка (${Math.round(on_hand)})` },
        };
      }
      const written = clear_station_clock(
        apply_writeoff(state, materialId, qty, note, new Date().toISOString(), actor),
        materialId
      );
      return {
        state: commit_spot(full, spot, written),
        value: { ok: true, rows: rows_of(written) },
      };
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ ok: true, rows: saved.rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'не удалось списать' },
      { status: 500 }
    );
  }
}
