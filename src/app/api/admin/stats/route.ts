import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_orders } from '@/lib/demo-orders-server';
import type { order, order_item } from '@/lib/types';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

function start_of_day_moscow(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return new Date(`${y}-${m}-${day}T00:00:00+03:00`);
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const since_week = new Date();
  since_week.setDate(since_week.getDate() - 7);
  const today_start = start_of_day_moscow();

  let orders: order[] = [];

  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', since_week.toISOString())
      .neq('status', 'cancelled');
    orders = (data as order[]) || [];
  }

  for (const o of await get_demo_orders(false)) {
    if (new Date(o.created_at) >= since_week && o.status !== 'cancelled') {
      orders.push(o);
    }
  }

  const week_orders = orders;
  const today_orders = week_orders.filter((o) => new Date(o.created_at) >= today_start);

  const revenue_today = today_orders.reduce((s, o) => s + Number(o.total_price), 0);
  const revenue_week = week_orders.reduce((s, o) => s + Number(o.total_price), 0);
  const items_today = today_orders.reduce(
    (s, o) => s + (o.items as order_item[]).reduce((n, i) => n + i.quantity, 0),
    0
  );

  const product_map = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const o of week_orders) {
    for (const item of o.items as order_item[]) {
      const key = item.menu_id || item.name;
      const prev = product_map.get(key) ?? { name: item.name, quantity: 0, revenue: 0 };
      prev.quantity += item.quantity;
      prev.revenue += item.price * item.quantity;
      product_map.set(key, prev);
    }
  }

  const top_products = [...product_map.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const by_day: Record<string, { revenue: number; orders: number }> = {};
  for (const o of week_orders) {
    const day = new Date(o.created_at).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
    if (!by_day[day]) by_day[day] = { revenue: 0, orders: 0 };
    by_day[day].revenue += Number(o.total_price);
    by_day[day].orders += 1;
  }

  return NextResponse.json({
    orders_today: today_orders.length,
    revenue_today: Math.round(revenue_today),
    orders_week: week_orders.length,
    revenue_week: Math.round(revenue_week),
    avg_check_week: week_orders.length ? Math.round(revenue_week / week_orders.length) : 0,
    items_today,
    top_products,
    revenue_by_day: Object.entries(by_day).map(([day, v]) => ({
      day,
      revenue: Math.round(v.revenue),
      orders: v.orders,
    })),
  });
}
