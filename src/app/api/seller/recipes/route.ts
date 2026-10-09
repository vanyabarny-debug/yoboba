import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_finance_state } from '@/lib/finance/finance-server';
import { effective_card_size, size_label } from '@/lib/finance/model';
import {
  cook_steps_view,
  resolved_prep_steps_for_volume,
  type public_recipe,
} from '@/lib/finance/prep-steps';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET() {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const state = await read_finance_state();
  const recipes: public_recipe[] = state.techCards
    .filter((c) => c.menu_item_id)
    .map((card) => {
      const sizes: public_recipe['sizes'] = {};
      for (const key of Object.keys(card.sizes)) {
        const size = effective_card_size(card, key, state.materials);
        if (!size) continue;
        sizes[key] = {
          volume: size.volume,
          label: size_label(key),
          steps: cook_steps_view(
            resolved_prep_steps_for_volume(card, key, state.materials, size),
            state.materials
          ),
        };
      }
      return {
        menu_id: card.menu_item_id as string,
        name: card.name,
        sizes,
      };
    });
  return NextResponse.json(
    { recipes },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
