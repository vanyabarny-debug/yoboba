import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_bonus, redeem_demo_bonus } from '@/lib/demo-bonus-server';

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
    amount?: number;
    order_id?: string;
  };
  const phone = normalize_phone(body.phone);
  const amount = Math.max(
    1,
    Math.floor(body.amount ?? FREE_DRINK_BONUS_THRESHOLD)
  );

  if (!phone) {
    return NextResponse.json(
      { error: 'нужен телефон гостя, чтобы списать тапикоины' },
      { status: 400 }
    );
  }

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, name, phone, bonus_balance')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'гость не найден' }, { status: 404 });
    }

    const current = Number(profile.bonus_balance) || 0;
    if (current < amount) {
      return NextResponse.json(
        {
          error: `не хватает тапикоинов: есть ${current}, нужно ${amount}`,
          bonus_balance: current,
        },
        { status: 400 }
      );
    }

    const next = current - amount;
    const { error: upd_err } = await admin
      .from('profiles')
      .update({ bonus_balance: next, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (upd_err) {
      return NextResponse.json({ error: upd_err.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      redeemed: amount,
      bonus_balance: next,
      customer: {
        id: profile.id,
        name: profile.name,
        phone: profile.phone,
        bonus_balance: next,
      },
      order_id: body.order_id || null,
    });
  }

  const demo = await get_demo_bonus(phone);
  if (!demo) {
    return NextResponse.json({ error: 'гость не найден' }, { status: 404 });
  }

  if (demo.bonus_balance < amount) {
    return NextResponse.json(
      {
        error: `не хватает тапикоинов: есть ${demo.bonus_balance}, нужно ${amount}`,
        bonus_balance: demo.bonus_balance,
      },
      { status: 400 }
    );
  }

  const updated = await redeem_demo_bonus(phone, amount);
  if (!updated) {
    return NextResponse.json({ error: 'не удалось списать' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    redeemed: amount,
    bonus_balance: updated.bonus_balance,
    customer: {
      id: `demo-${phone}`,
      name: updated.name,
      phone: updated.phone,
      bonus_balance: updated.bonus_balance,
    },
    order_id: body.order_id || null,
  });
}
