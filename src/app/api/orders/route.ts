import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { create_service_client } from '@/lib/supabase/service';
import { calc_order_bonus, FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { redeem_bonus_points } from '@/lib/bonus-server';
import { normalize_phone } from '@/lib/phone';
import { allocate_daily_order_number } from '@/lib/order-number';
import { is_pickup_feasible } from '@/lib/kitchen-queue';
import { load_active_orders, load_menu_map } from '@/lib/kitchen-server';
import type { order_item } from '@/lib/types';
import { student_line_price } from '@/lib/student-discount';
import { read_student_status } from '@/lib/student-server';

export async function GET() {
  const supabase = await create_server_client();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('orders')
    .select('id, user_id, items, total_price, status, payment_type, pickup_time, created_at, order_number, order_day')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error && /does not exist/i.test(error.message)) {
    const fallback = await supabase
      .from('orders')
      .select('id, user_id, items, total_price, status, payment_type, pickup_time, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (fallback.error) {
      console.error('orders GET', fallback.error.message);
      return NextResponse.json({ error: 'не удалось загрузить заказы' }, { status: 500 });
    }
    return NextResponse.json({ orders: fallback.data || [] });
  }

  if (error) {
    console.error('orders GET', error.message);
    return NextResponse.json({ error: 'не удалось загрузить заказы' }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] });
}

export async function POST(request: Request) {
  const supabase = await create_server_client();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const body = await request.json();
  const items = body.items as order_item[] | undefined;
  const total_price = Number(body.total_price);
  const payment_type = (body.payment_type as string) || 'cash';
  const pickup_time = body.pickup_time as string | undefined;
  const redeem_bonus = Boolean(body.redeem_bonus);

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

  const student = await read_student_status({ user_id: user.id, phone: profile_phone });
  const priced_items = items.map((i) => {
    const menu = menu_by_id.get(i.menu_id);
    return {
      ...i,
      price: student_line_price(
        Number(i.price) || 0,
        { category: menu?.category, menu_id: i.menu_id },
        student.student_verified
      ),
    };
  });
  const priced_total = priced_items.reduce((s, i) => s + i.price * i.quantity, 0);

  let redeemed = 0;
  let bonus_balance_after = Number(profile?.bonus_balance) || 0;
  let final_total = priced_total;
  let final_payment = payment_type;
  let is_paid = false;

  if (redeem_bonus) {
    const result = await redeem_bonus_points({
      user_id: user.id,
      phone: profile_phone,
      amount: FREE_DRINK_BONUS_THRESHOLD,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, bonus_balance: result.bonus_balance },
        { status: result.status }
      );
    }
    redeemed = result.redeemed;
    bonus_balance_after = result.bonus_balance;
    final_total = 0;
    final_payment = 'bonus';
    is_paid = true;
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
    items: priced_items,
    total_price: final_total,
    payment_type: final_payment,
    pickup_time,
    status: 'new' as const,
    is_paid,
    customer_name,
    customer_phone: profile_phone,
    order_number: daily_number.order_number,
    order_day: daily_number.order_day,
  };

  let { data, error } = await supabase.from('orders').insert(order_payload).select().single();

  if (error && /is_paid|customer_name|customer_phone|payment_type/i.test(error.message)) {
    const retry = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        items: priced_items,
        total_price: final_total,
        payment_type: final_payment === 'bonus' ? 'online' : final_payment,
        pickup_time,
        status: 'new',
        order_number: daily_number.order_number,
        order_day: daily_number.order_day,
      })
      .select()
      .single();
    data = retry.data
      ? { ...retry.data, is_paid, customer_name, customer_phone: profile_phone, payment_type: final_payment }
      : retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'не удалось создать заказ' },
      { status: 500 }
    );
  }

  await supabase.from('cart_items').delete().eq('user_id', user.id);

  let earned = 0;
  if (!redeem_bonus && final_total > 0 && !user.is_anonymous) {
    earned = calc_order_bonus(
      priced_items.map((i) => ({
        menu_id: i.menu_id,
        quantity: i.quantity,
        category: menu_by_id.get(i.menu_id)?.category,
      }))
    );
    if (earned > 0) {
      const current = bonus_balance_after;
      bonus_balance_after = current + earned;
      await admin
        .from('profiles')
        .update({
          bonus_balance: bonus_balance_after,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    }
  }

  return NextResponse.json({
    order: { ...data, is_paid, payment_type: final_payment, total_price: final_total },
    bonus_earned: earned,
    bonus_redeemed: redeemed,
    bonus_balance: bonus_balance_after,
  });
}
