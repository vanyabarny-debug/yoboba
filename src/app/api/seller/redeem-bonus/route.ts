import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { redeem_bonus_points } from '@/lib/bonus-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as {
    phone?: string;
    user_id?: string;
    amount?: number;
    order_id?: string;
  };

  const result = await redeem_bonus_points({
    phone: body.phone,
    user_id: body.user_id,
    amount: body.amount ?? FREE_DRINK_BONUS_THRESHOLD,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, bonus_balance: result.bonus_balance },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    redeemed: result.redeemed,
    bonus_balance: result.bonus_balance,
    customer: result.customer,
    order_id: body.order_id || null,
  });
}
