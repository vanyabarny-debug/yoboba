import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  clear_order_prep,
  get_seller_prep_map,
  set_order_prep,
  type seller_prep_state,
} from '@/lib/seller-prep-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET() {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const prep = await get_seller_prep_map();
  return NextResponse.json({ prep });
}

export async function PUT(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const order_id = body.order_id as string | undefined;
  const prep = body.prep as Record<string, seller_prep_state> | undefined;
  const clear = Boolean(body.clear);

  if (!order_id) {
    return NextResponse.json({ error: 'нет order_id' }, { status: 400 });
  }

  if (clear) {
    await clear_order_prep(order_id);
    return NextResponse.json({ ok: true });
  }

  if (!prep || typeof prep !== 'object') {
    return NextResponse.json({ error: 'нет prep' }, { status: 400 });
  }

  const all = await set_order_prep(order_id, prep);
  return NextResponse.json({ prep: all[order_id] });
}
