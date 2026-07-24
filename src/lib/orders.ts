import type { order, order_item } from '@/lib/types';

type create_order_input = {
  user_id: string;
  items: order_item[];
  total_price: number;
  payment_type: 'cash' | 'card' | 'online' | 'bonus';
  pickup_time: string;
  redeem_bonus?: boolean;
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
      redeem_bonus: Boolean(input.redeem_bonus),
    }),
  });

  const body = (await res.json()) as {
    order?: order;
    error?: string;
    bonus_earned?: number;
    bonus_redeemed?: number;
    bonus_balance?: number;
  };
  if (!res.ok) {
    return { data: null, error: new Error(body.error || 'не удалось создать заказ'), meta: body };
  }

  return {
    data: body.order ?? null,
    error: null,
    meta: {
      bonus_earned: body.bonus_earned ?? 0,
      bonus_redeemed: body.bonus_redeemed ?? 0,
      bonus_balance: body.bonus_balance,
    },
  };
}

export async function fetch_my_orders() {
  const res = await fetch('/api/orders', { credentials: 'same-origin' });
  const body = (await res.json()) as { orders?: order[]; error?: string };
  if (!res.ok) {
    return { data: [] as order[], error: new Error(body.error || 'не удалось загрузить заказы') };
  }
  return { data: body.orders || [], error: null };
}
