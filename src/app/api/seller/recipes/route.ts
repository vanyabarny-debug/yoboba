import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_finance_state } from '@/lib/finance/finance-server';
import { size_label } from '@/lib/finance/model';
import { cook_steps_view, resolved_prep_steps, type public_recipe } from '@/lib/finance/prep-steps';

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
      for (const [key, size] of Object.entries(card.sizes)) {
        sizes[key] = {
          volume: size.volume,
          label: size_label(key),
          steps: cook_steps_view(resolved_prep_steps(size, state.materials), state.materials),
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
