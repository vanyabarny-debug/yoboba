import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  create_fake_order_from_items,
  get_demo_orders,
  update_demo_order,
} from '@/lib/demo-orders-server';
import type { order, order_item } from '@/lib/types';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET() {
  return NextResponse.json({ orders: get_demo_orders(true) });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.fake === true) {
    if (!(await is_staff())) {
      return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
    }
    const samples: order_item[] = [
      { menu_id: 'bt-1', name: 'классический бабл ти', price: 290, quantity: 1 },
      { menu_id: 'mt-1', name: 'матча латте', price: 320, quantity: 1 },
    ];
    const order = create_fake_order_from_items(samples, body.pickup_minutes ?? 8);
    return NextResponse.json({ order });
  }

  const items = body.items as order_item[] | undefined;
  if (!items?.length) {
    return NextResponse.json({ error: 'корзина пуста' }, { status: 400 });
  }

  const order = create_fake_order_from_items(items, body.pickup_minutes ?? 12);
  return NextResponse.json({ order });
}

export async function PATCH(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const updated = update_demo_order(body.id, body.patch);
  if (!updated) {
    return NextResponse.json({ error: 'заказ не найден' }, { status: 404 });
  }
  return NextResponse.json({ order: updated });
}
