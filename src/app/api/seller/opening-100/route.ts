import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { normalize_phone } from '@/lib/phone';
import {
  get_opening_100_status,
  redeem_opening_100,
} from '@/lib/opening-100-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const url = new URL(request.url);
  const phone = normalize_phone(url.searchParams.get('phone'));
  const status = await get_opening_100_status(phone);
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    items?: { menu_id: string; name: string; price: number; quantity: number }[];
    pickup_minutes?: number;
    seller_id?: string;
    seller_name?: string;
    shift_id?: string | null;
    customer_name?: string;
  };

  try {
    const result = await redeem_opening_100({
      phone: String(body.phone || ''),
      items: body.items || [],
      pickup_minutes: body.pickup_minutes,
      seller_id: body.seller_id || null,
      seller_name: body.seller_name || null,
      shift_id: body.shift_id || null,
      customer_name: body.customer_name || null,
    });
    const status = await get_opening_100_status(result.entry.phone);
    return NextResponse.json({
      entry: result.entry,
      order: result.order,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось выдать напиток';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
