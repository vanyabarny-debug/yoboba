import { NextResponse } from 'next/server';
import { is_pickup_feasible, suggest_pickup_slots } from '@/lib/kitchen-queue';
import { load_active_orders, load_menu_map } from '@/lib/kitchen-server';

type cart_line = { menu_id: string; name: string; quantity: number };

export async function POST(request: Request) {
  const body = await request.json();
  const cart_lines = (body.cart_lines as cart_line[] | undefined) ?? [];
  const pickup_at = body.pickup_at as string | undefined;

  if (!cart_lines.length) {
    return NextResponse.json({ error: 'корзина пуста' }, { status: 400 });
  }

  const [menu_by_id, active_orders] = await Promise.all([
    load_menu_map(),
    load_active_orders(),
  ]);

  if (pickup_at) {
    const at = new Date(pickup_at).getTime();
    if (Number.isNaN(at)) {
      return NextResponse.json({ error: 'неверное время' }, { status: 400 });
    }
    const feasible = is_pickup_feasible({
      active_orders,
      menu_by_id,
      cart_lines,
      pickup_at: at,
    });
    return NextResponse.json({ feasible });
  }

  const slots = suggest_pickup_slots({ active_orders, menu_by_id, cart_lines });
  return NextResponse.json({ slots });
}
