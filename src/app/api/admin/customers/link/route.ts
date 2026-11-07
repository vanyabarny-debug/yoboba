import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { staff_actor } from '@/lib/staff-actor';
import { assign_order_to_customer, list_loose_orders } from '@/lib/customer-link-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const days = Math.min(120, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  try {
    return NextResponse.json({ orders: await list_loose_orders(days) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'не удалось загрузить продажи' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    order_id?: unknown;
    customer_id?: unknown;
    phone?: unknown;
    name?: unknown;
    earn?: unknown;
  } | null;
  const order_id = typeof body?.order_id === 'string' ? body.order_id.trim() : '';
  const customer_id = typeof body?.customer_id === 'string' ? body.customer_id.trim().slice(0, 80) : '';
  if (!order_id || order_id.length > 80 || !customer_id) {
    return NextResponse.json({ error: 'выберите покупку и гостя' }, { status: 400 });
  }
  const result = await assign_order_to_customer({
    order_id,
    customer_id,
    phone: typeof body?.phone === 'string' ? body.phone : null,
    name: typeof body?.name === 'string' ? body.name.slice(0, 120) : null,
    earn: body?.earn !== false,
    actor,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
