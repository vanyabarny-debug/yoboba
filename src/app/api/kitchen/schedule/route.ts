import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { build_kitchen_schedule } from '@/lib/kitchen-queue';
import { load_active_orders, load_menu_map } from '@/lib/kitchen-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller' || role === 'barista';
}

export async function GET() {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const [menu_by_id, active_orders] = await Promise.all([
    load_menu_map(),
    load_active_orders(),
  ]);

  const { lines, feasible } = build_kitchen_schedule({
    active_orders,
    menu_by_id,
  });

  return NextResponse.json({
    lines: lines.map((l) => ({
      ...l,
      start_at: new Date(l.start_at).toISOString(),
      end_at: new Date(l.end_at).toISOString(),
      pickup_at: new Date(l.pickup_at).toISOString(),
    })),
    feasible,
    orders: active_orders,
  });
}
