import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { normalize_phone } from '@/lib/phone';
import {
  claim_gift,
  list_redeemable_gifts,
  public_gift_view,
} from '@/lib/gifts-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const phone = normalize_phone(new URL(request.url).searchParams.get('phone'));
  if (!phone) {
    return NextResponse.json({ gifts: [] });
  }

  const gifts = await list_redeemable_gifts(phone);
  return NextResponse.json({ gifts: gifts.map(public_gift_view) });
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    gift_id?: string;
    pickup_minutes?: number;
  };

  const gift_id = String(body.gift_id || '');
  if (!gift_id) {
    return NextResponse.json({ error: 'нет gift_id' }, { status: 400 });
  }

  const minutes = Math.max(5, Math.min(40, Number(body.pickup_minutes) || 8));
  const pickup_time = new Date(Date.now() + minutes * 60_000).toISOString();

  try {
    const result = await claim_gift({
      gift_id,
      actor_phone: null,
      pickup_time,
      staff: true,
    });
    return NextResponse.json({
      gift: public_gift_view(result.gift),
      order: result.order,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось выдать подарок';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
