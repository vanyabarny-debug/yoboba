import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { each_day } from '@/lib/finance/model';
import type { order } from '@/lib/types';

function moscow_ymd(d: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** выручка живых заказов за даты включительно, по Москве */
export async function sum_order_revenue(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(`${to}T00:00:00+03:00`);
  end.setDate(end.getDate() + 1);

  let orders: order[] = [];
  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, created_at, total_price')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .neq('status', 'cancelled');
    if (error) throw new Error(error.message);
    orders = (data as order[]) || [];
  }
  for (const order of await get_demo_orders(false)) {
    const t = new Date(order.created_at);
    if (t >= start && t < end && order.status !== 'cancelled') orders.push(order);
  }

  const day_map = new Map<string, { revenue: number; orders: number }>();
  let revenue = 0;
  for (const order of orders) {
    const rev = Number(order.total_price) || 0;
    revenue += rev;
    const ymd = moscow_ymd(new Date(order.created_at));
    const bucket = day_map.get(ymd) ?? { revenue: 0, orders: 0 };
    bucket.revenue += rev;
    bucket.orders += 1;
    day_map.set(ymd, bucket);
  }

  return {
    revenue: Math.round(revenue),
    orders: orders.length,
    by_day: each_day(from, to).map((day) => {
      const row = day_map.get(day);
      return { day, revenue: Math.round(row?.revenue ?? 0), orders: row?.orders ?? 0 };
    }),
  };
}
