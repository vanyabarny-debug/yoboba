import type { order, order_item } from '@/lib/types';

type create_order_input = {
  user_id: string;
  items: order_item[];
  total_price: number;
  payment_type: 'cash' | 'card' | 'online';
  pickup_time: string;
};

export async function create_order(input: create_order_input) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: input.items,
      total_price: input.total_price,
      payment_type: input.payment_type,
      pickup_time: input.pickup_time,
    }),
  });

  const body = (await res.json()) as { order?: unknown; error?: string };
  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'не удалось создать заказ') };
  }

  return { data: body.order, error: null };
}

export async function fetch_my_orders() {
  const res = await fetch('/api/orders', { credentials: 'same-origin' });
  const body = (await res.json()) as { orders?: order[]; error?: string };
  if (!res.ok) {
    return { data: [] as order[], error: new Error(body.error || 'не удалось загрузить заказы') };
  }
  return { data: body.orders || [], error: null };
}
