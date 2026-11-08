import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { is_supabase_configured } from '@/lib/supabase/config';
import { mutate_finance_state, read_finance_state } from '@/lib/finance/finance-server';
import {
  effective_card_size,
  materials_with_preps,
  size_label,
  stock_category_for,
  type finance_state,
} from '@/lib/finance/model';
import {
  attach_prep_howto,
  cook_steps_view,
  resolved_prep_steps_for_volume,
  save_cashier_recipe,
  type public_recipe,
} from '@/lib/finance/prep-steps';
import { resync_order_stock } from '@/lib/order-revise-server';

export const dynamic = 'force-dynamic';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

function recipe_payload(state: finance_state) {
  const materials = materials_with_preps(state);
  const recipes: public_recipe[] = state.techCards
    .filter((c) => c.menu_item_id)
    .map((card) => {
      const sizes: public_recipe['sizes'] = {};
      for (const key of Object.keys(card.sizes)) {
        const size = effective_card_size(card, key, materials);
        if (!size) continue;
        const resolved = resolved_prep_steps_for_volume(card, key, materials, size);
        sizes[key] = {
          key,
          volume: size.volume,
          label: size_label(key),
          steps: attach_prep_howto(
            cook_steps_view(resolved, materials),
            resolved,
            state.prepRecipes ?? [],
            materials
          ),
        };
      }
      return {
        menu_id: card.menu_item_id as string,
        name: card.name,
        sizes,
      };
    });
  const catalog = materials
    .filter((m) => m.name.trim() && stock_category_for(m) !== 'packaging')
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return { recipes, materials: catalog };
}

export async function GET() {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const state = await read_finance_state();
  return NextResponse.json(recipe_payload(state), {
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'рецепт пишется только в supabase' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'некорректный json' }, { status: 400 });
  }

  const rec = body as { menu_id?: unknown; size?: unknown; lines?: unknown; order_id?: unknown };
  const menu_id = typeof rec.menu_id === 'string' ? rec.menu_id.trim() : '';
  const size = typeof rec.size === 'string' ? rec.size.trim() : '';
  const order_id = typeof rec.order_id === 'string' ? rec.order_id.trim() : '';
  if (!menu_id || !size) {
    return NextResponse.json({ error: 'нужны напиток и размер' }, { status: 400 });
  }
  if (!Array.isArray(rec.lines) || rec.lines.length > 40) {
    return NextResponse.json({ error: 'в рецепте нужны ингредиенты' }, { status: 400 });
  }
  const lines = rec.lines.map((row) => {
    const line = row as { materialId?: unknown; qty?: unknown };
    return {
      materialId: typeof line.materialId === 'string' ? line.materialId.trim() : '',
      qty: Number(line.qty),
    };
  });
  if (!lines.some((line) => line.materialId && line.qty > 0)) {
    return NextResponse.json({ error: 'рецепт не может быть пустым' }, { status: 400 });
  }
  if (lines.some((line) => line.materialId && (!(line.qty >= 0) || line.qty > 5000))) {
    return NextResponse.json({ error: 'граммы — от 0 до 5000' }, { status: 400 });
  }

  try {
    const saved = await mutate_finance_state<
      { ok: false; error: string } | { ok: true; payload: ReturnType<typeof recipe_payload> }
    >((state) => {
      const index = state.techCards.findIndex((card) => card.menu_item_id === menu_id);
      if (index < 0) return { state: null, value: { ok: false, error: 'у напитка нет техкарты' } };
      const materials = materials_with_preps(state);
      const known = new Set(materials.map((m) => m.id));
      if (lines.some((line) => line.materialId && line.qty > 0 && !known.has(line.materialId))) {
        return { state: null, value: { ok: false, error: 'такой позиции нет на складе' } };
      }
      const techCards = state.techCards.slice();
      techCards[index] = save_cashier_recipe(state.techCards[index], size, lines, materials);
      const next = { ...state, techCards };
      return { state: next, value: { ok: true, payload: recipe_payload(next) } };
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });

    let warning = '';
    if (order_id) {
      const again = await resync_order_stock(order_id);
      if (!again.ok) warning = again.error;
    }
    return NextResponse.json({ ...saved.payload, ...(warning ? { warning } : {}) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'не удалось сохранить рецепт' },
      { status: 500 }
    );
  }
}
