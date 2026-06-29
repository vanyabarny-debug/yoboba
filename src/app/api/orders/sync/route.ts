import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';

type order_payload = {
  order_id: string;
  user_id: string;
  items: unknown[];
  total_price: number;
  payment_type: string;
  pickup_time: string;
};

export async function POST(request: Request) {
  const supabase = await create_server_client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const payload: order_payload = await request.json();

  const erp_url = process.env.ERP_API_URL;
  const erp_token = process.env.ERP_API_TOKEN;

  if (!erp_url || !erp_token) {
    return NextResponse.json(
      { error: 'erp не настроен', synced: false },
      { status: 503 }
    );
  }

  // шаблон интеграции с iiko / quick resto / другой erp
  const erp_body = {
    external_id: payload.order_id,
    customer_id: payload.user_id,
    items: payload.items,
    total: payload.total_price,
    payment_method: payload.payment_type,
    scheduled_at: payload.pickup_time,
    source: 'yoboba',
  };

  try {
    const res = await fetch(erp_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `bearer ${erp_token}`,
      },
      body: JSON.stringify(erp_body),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'erp отклонил заказ', details: text, synced: false },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ synced: true, erp_response: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'неизвестная ошибка';
    return NextResponse.json({ error: message, synced: false }, { status: 500 });
  }
}
