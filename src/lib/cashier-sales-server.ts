import { get_transactions, record_cash_for_order } from '@/lib/cash-server';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { record_handed_order, list_handed_rows } from '@/lib/handed-orders-server';
import {
  moscow_day_start_iso,
  moscow_next_day_iso,
  moscow_today_iso,
} from '@/lib/order-number';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { order } from '@/lib/types';

function same_moscow_day(iso: string | null | undefined, day: string) {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return moscow_today_iso(parsed) === day;
}

/** выданные за календарный день: заказы supabase + демо, без фильтра по кассиру */
export async function completed_orders_for_day(day: string): Promise<order[]> {
  const by_id = new Map<string, order>();

  const demo = await get_demo_orders(false);
  for (const order of demo) {
    if (order.status !== 'completed') continue;
    if (order.order_day === day || same_moscow_day(order.created_at, day)) {
      by_id.set(order.id, { ...order, status: 'completed' });
    }
  }

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const start = moscow_day_start_iso(day);
    const end = moscow_day_start_iso(moscow_next_day_iso(day));
    const primary = await admin
      .from('orders')
      .select('*')
      .eq('status', 'completed')
      .or(`order_day.eq.${day},and(created_at.gte.${start},created_at.lt.${end})`);

    let rows = primary.data as order[] | null;
    if (primary.error) {
      const fallback = await admin
        .from('orders')
        .select('*')
        .eq('status', 'completed')
        .gte('created_at', start)
        .lt('created_at', end);
      rows = fallback.error ? [] : (fallback.data as order[]);
    }

    for (const row of rows || []) {
      by_id.set(row.id, { ...row, status: 'completed', is_paid: Boolean(row.is_paid) });
    }
  }

  const orders = [...by_id.values()];
  orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return orders;
}

/**
 * Записать продажи дня на кассира, если их ещё нет в журнале.
 * Уже привязанный заказ не переписываем — чужая смена остаётся чужой.
 */
export async function remember_cashier_sales(input: {
  seller_id: string;
  seller_name: string;
  shift_date: string;
  orders: order[];
}) {
  if (!input.seller_id) return;
  const existing = await list_handed_rows();
  const handed_ids = new Set(
    existing.filter((row) => row.shift_date === input.shift_date).map((row) => row.order_id)
  );

  for (const order of input.orders) {
    if (!order?.id || handed_ids.has(order.id)) continue;
    await record_handed_order({
      order,
      seller_id: input.seller_id,
      seller_name: input.seller_name,
      shift_date: input.shift_date,
      handed_at: order.created_at || new Date().toISOString(),
    });
    handed_ids.add(order.id);
  }

  const cash = await get_transactions({ shift_date: input.shift_date });
  const paid_ids = new Set(cash.map((row) => row.order_id).filter((id): id is string => Boolean(id)));

  for (const order of input.orders) {
    if (!order?.id || paid_ids.has(order.id)) continue;
    if (order.is_paid === false && order.payment_type !== 'bonus') continue;
    const payment_method =
      order.payment_type === 'cash' || order.payment_type === 'bonus' ? order.payment_type : 'card';
    const total = Number(order.total_price) || 0;
    await record_cash_for_order({
      order_id: order.id,
      seller_id: input.seller_id,
      seller_name: input.seller_name,
      order_total: payment_method === 'bonus' ? 0 : total,
      payment_method,
      amount_received: payment_method === 'cash' ? total : null,
      change_given: null,
      items_summary: (order.items || [])
        .map((item) => `${item.name} ×${item.quantity}`)
        .join('; '),
      shift_date: input.shift_date,
      created_at: order.created_at,
    });
    paid_ids.add(order.id);
  }
}
