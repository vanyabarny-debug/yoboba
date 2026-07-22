import type { SupabaseClient } from '@supabase/supabase-js';
import type { order } from '@/lib/types';

const MOSCOW_TZ = 'Europe/Moscow';

/** сегодня по Москве: YYYY-MM-DD */
export function moscow_today_iso(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** начало суток (МСК) в ISO UTC */
export function moscow_day_start_iso(day = moscow_today_iso()): string {
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

export type daily_order_number = {
  order_day: string;
  order_number: number;
};

export function format_order_number(
  order: Pick<order, 'id' | 'order_number' | 'order_day' | 'created_at'>
): string {
  if (typeof order.order_number === 'number' && order.order_number > 0) {
    return String(order.order_number);
  }
  return order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** следующий номер заказа на сегодня (1, 2, 3…), счётчик сбрасывается каждый день */
export async function allocate_daily_order_number(
  admin: SupabaseClient
): Promise<daily_order_number> {
  const order_day = moscow_today_iso();

  const { data: rpc_number, error: rpc_error } = await admin.rpc('next_order_number', {
    p_day: order_day,
  });

  if (!rpc_error && typeof rpc_number === 'number' && rpc_number > 0) {
    return { order_day, order_number: rpc_number };
  }

  // запасной путь, если миграция ещё не применена
  const { count, error: count_error } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', moscow_day_start_iso(order_day));

  if (count_error) {
    throw new Error(count_error.message || 'не удалось выдать номер заказа');
  }

  return { order_day, order_number: (count ?? 0) + 1 };
}
