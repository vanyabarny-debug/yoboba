import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { create_service_client } from '@/lib/supabase/service';
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

  const admin = create_service_client();
  const { data: profile } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    await admin.from('profiles').upsert(
      { id: user.id, name: 'гость', bonus_balance: 0, role: 'user' },
      { onConflict: 'id' }
    );
  }

  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: user.id,
      items,
      total_price,
      payment_type,
      pickup_time,
      status: 'new',
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'не удалось создать заказ' }, { status: 500 });
  }

  await supabase.from('cart_items').delete().eq('user_id', user.id);

  return NextResponse.json({ order: data });
}
