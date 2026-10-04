import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { staff_actor } from '@/lib/staff-actor';
import { delete_order, order_id_ok, parse_order_items, revise_order } from '@/lib/order-revise-server';
import type { order } from '@/lib/types';

const statuses = new Set<order['status']>(['new', 'preparing', 'ready', 'completed', 'cancelled']);

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function PATCH(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    items?: unknown;
    status?: string;
  } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!order_id_ok(id)) {
    return NextResponse.json({ error: 'покупка не найдена' }, { status: 400 });
  }
  const parsed = parse_order_items(body?.items);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const status = body?.status;
  if (status != null && !statuses.has(status as order['status'])) {
    return NextResponse.json({ error: 'неверный статус' }, { status: 400 });
  }

  const result = await revise_order({
    id,
    items: parsed.items,
    ...(status ? { status: status as order['status'] } : {}),
    actor,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ order: result.order });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const actor = await staff_actor();
  if (!actor) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const result = await delete_order({ id, actor });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
