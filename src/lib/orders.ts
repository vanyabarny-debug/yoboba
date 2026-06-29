import { create_client } from '@/lib/supabase/client';
import type { order_item } from '@/lib/types';

type create_order_input = {
  user_id: string;
  items: order_item[];
  total_price: number;
  payment_type: 'cash' | 'card' | 'online';
  pickup_time: string;
};

export async function create_order(input: create_order_input) {
  const supabase = create_client();

  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: input.user_id,
      items: input.items,
      total_price: input.total_price,
      payment_type: input.payment_type,
      pickup_time: input.pickup_time,
      status: 'new',
    })
    .select()
    .single();

  if (error || !data) return { data: null, error };

  // синхронизация с erp при подтверждённой оплате
  if (['card', 'online'].includes(input.payment_type)) {
    await fetch('/api/orders/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order_id: data.id,
        user_id: input.user_id,
        items: input.items,
        total_price: input.total_price,
        payment_type: input.payment_type,
        pickup_time: input.pickup_time,
      }),
    });
  }

  await supabase.from('cart_items').delete().eq('user_id', input.user_id);

  return { data, error: null };
}
