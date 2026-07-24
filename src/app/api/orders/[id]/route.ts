import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import type { order } from '@/lib/types';

type params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: params) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'нет id' }, { status: 400 });
  }

  if (is_supabase_configured()) {
    const supabase = await create_server_client();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (data) {
        return NextResponse.json({
          order: {
            ...data,
            is_paid:
              Boolean(data.is_paid) ||
              data.payment_type === 'bonus' ||
              (data.payment_type === 'online' && Number(data.total_price) === 0),
          } as order,
        });
      }
    }

    const demo = (await get_demo_orders(false)).find((o) => o.id === id);
    if (demo) return NextResponse.json({ order: demo as order });
    if (!user) {
      return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
    }
    return NextResponse.json({ error: 'заказ не найден' }, { status: 404 });
  }

  const demo = (await get_demo_orders(false)).find((o) => o.id === id);
  if (!demo) {
    return NextResponse.json({ error: 'заказ не найден' }, { status: 404 });
  }
  return NextResponse.json({ order: demo });
}
