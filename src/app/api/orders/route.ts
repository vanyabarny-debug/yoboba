import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { create_service_client } from '@/lib/supabase/service';
import { calc_order_bonus } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';
import { allocate_daily_order_number } from '@/lib/order-number';
import { is_pickup_feasible } from '@/lib/kitchen-queue';
import { load_active_orders, load_menu_map } from '@/lib/kitchen-server';
import type { order_item } from '@/lib/types';

export async function GET() {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] });
}

export async function POST(request: Request) {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const body = await request.json();
  const items = body.items as order_item[] | undefined;
  const total_price = Number(body.total_price);
  const payment_type = (body.payment_type as string) || 'cash';
  const pickup_time = body.pickup_time as string | undefined;

  if (!items?.length || Number.isNaN(total_price) || !pickup_time) {
    return NextResponse.json({ error: 'неверные данные заказа' }, { status: 400 });
  }

  const pickup_at = new Date(pickup_time).getTime();
  if (Number.isNaN(pickup_at) || pickup_at <= Date.now()) {
    return NextResponse.json({ error: 'неверное время выдачи' }, { status: 400 });
  }

  const [menu_by_id, active_orders] = await Promise.all([
    load_menu_map(),
    load_active_orders(),
  ]);
  const cart_lines = items.map((i) => ({
    menu_id: i.menu_id,
    name: i.name,
    quantity: i.quantity,
  }));

  const admin = create_service_client();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, bonus_balance, phone, name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) {
    await admin.from('profiles').upsert(
      { id: user.id, name: 'гость', bonus_balance: 0, role: 'user' },
      { onConflict: 'id' }
    );
  }

  const profile_phone =
    normalize_phone(profile?.phone) ||
    normalize_phone((user.user_metadata as { phone?: string } | undefined)?.phone);
  if (!profile_phone) {
    return NextResponse.json(
      { error: 'укажите номер телефона перед заказом' },
      { status: 400 }
    );
  }

  const customer_name =
    (profile?.name || '').trim() ||
    ((user.user_metadata as { name?: string } | undefined)?.name || '').trim() ||
    'гость';

  const feasible = is_pickup_feasible({
    active_orders,
    menu_by_id,
    cart_lines,
    pickup_at,
  });
  if (!feasible) {
    return NextResponse.json(
      { error: 'это время уже занято — выберите другой слот' },
      { status: 409 }
    );
  }

  let daily_number: { order_day: string; order_number: number };
  try {
    daily_number = await allocate_daily_order_number(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось выдать номер заказа';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const order_payload = {
    user_id: user.id,
    items,
    total_price,
    payment_type,
    pickup_time,
    status: 'new' as const,
    is_paid: false,
    customer_name,
    customer_phone: profile_phone,
    order_number: daily_number.order_number,
    order_day: daily_number.order_day,
  };

  let { data, error } = await supabase.from('orders').insert(order_payload).select().single();

  // если колонки is_paid / customer_* ещё не добавлены в Supabase — пишем без них
  if (error && /is_paid|customer_name|customer_phone/i.test(error.message)) {
    const retry = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        items,
        total_price,
        payment_type,
        pickup_time,
        status: 'new',
        order_number: daily_number.order_number,
        order_day: daily_number.order_day,
      })
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'не удалось создать заказ' }, { status: 500 });
  }

  await supabase.from('cart_items').delete().eq('user_id', user.id);

  const earned = calc_order_bonus(total_price);
  if (earned > 0 && !user.is_anonymous) {
    const current = profile?.bonus_balance ?? 0;
    await admin
      .from('profiles')
      .update({ bonus_balance: current + earned, updated_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  return NextResponse.json({ order: data, bonus_earned: earned });
}
