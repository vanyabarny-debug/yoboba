import { NextResponse } from 'next/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { staff_actor } from '@/lib/staff-actor';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import {
  base_unit,
  base_unit_label,
  bind_spot,
  commit_spot,
  is_prep_recipe_id,
  material_is_free,
  material_is_infinite,
  resolve_stock_spot,
  type finance_state,
} from '@/lib/finance/model';
import {
  apply_prep_batch_add,
  apply_prep_batch_fact,
  apply_prep_batch_make,
  apply_prep_batch_writeoff,
  prep_batch_views,
} from '@/lib/finance/prep-batches';

export const dynamic = 'force-dynamic';

const no_store = { 'cache-control': 'private, no-store, max-age=0' };

function spot_of(raw: unknown) {
  return resolve_stock_spot(typeof raw === 'string' ? raw : '');
}

export async function GET(request: Request) {
  if (!(await staff_actor())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const spot = spot_of(new URL(request.url).searchParams.get('spot_id'));
  const state = bind_spot(await read_finance_state(), spot);
  // что ещё можно долить в заготовку: весовое сырьё со склада
  const materials = state.materials
    .filter(
      (m) =>
        m.name.trim() &&
        base_unit(m.unit) !== 'pcs' &&
        m.category !== 'packaging' &&
        !material_is_free(m) &&
        !material_is_infinite(m) &&
        !is_prep_recipe_id(m.id)
    )
    .map((m) => ({ id: m.id, name: m.name, unit: base_unit_label(m.unit) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return NextResponse.json({ preps: prep_batch_views(state), materials }, { headers: no_store });
}

type body = {
  kind?: string;
  spot_id?: unknown;
  recipeId?: unknown;
  grams?: unknown;
  mode?: unknown;
  materialId?: unknown;
  qty?: unknown;
  note?: unknown;
};

export async function POST(request: Request) {
  const actor = await staff_actor();
  if (!actor) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'склад пишется только в supabase' }, { status: 503 });
  }
  let b: body;
  try {
    b = (await request.json()) as body;
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }
  const spot = spot_of(b.spot_id);
  const recipeId = String(b.recipeId || '');

  function run(state: finance_state) {
    if (b.kind === 'make') {
      return apply_prep_batch_make(state, {
        recipeId,
        grams: b.grams,
        mode: b.mode === 'more' ? 'more' : 'new',
        actor,
      });
    }
    if (b.kind === 'add') {
      return apply_prep_batch_add(state, { recipeId, materialId: String(b.materialId || ''), qty: b.qty, actor });
    }
    if (b.kind === 'writeoff') {
      return apply_prep_batch_writeoff(state, {
        recipeId,
        grams: b.grams,
        note: typeof b.note === 'string' ? b.note : undefined,
        actor,
      });
    }
    if (b.kind === 'fact') {
      return apply_prep_batch_fact(state, { recipeId, grams: b.grams, actor });
    }
    return { ok: false as const, error: 'неизвестное действие' };
  }

  try {
    const saved = await mutate_finance_state<
      { ok: false; error: string } | { ok: true; message: string; preps: ReturnType<typeof prep_batch_views> }
    >((full) => {
      const result = run(bind_spot(full, spot));
      if (!result.ok) return { state: null, value: result };
      return {
        state: commit_spot(full, spot, result.state),
        value: { ok: true as const, message: result.message, preps: prep_batch_views(result.state) },
      };
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json(saved, { headers: no_store });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ошибка записи' }, { status: 500 });
  }
}
