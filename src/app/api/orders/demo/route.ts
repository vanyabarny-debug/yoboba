import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  create_fake_order_from_items,
  get_demo_orders,
  update_demo_order,
} from '@/lib/demo-orders-server';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import {
  earn_bonus_for_paid_order,
  ensure_demo_bonus_row,
  redeem_bonus_points,
} from '@/lib/bonus-server';
import { normalize_phone } from '@/lib/phone';
import type { order_item } from '@/lib/types';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET(request: Request) {
  const all = new URL(request.url).searchParams.get('all') === '1';
  return NextResponse.json({ orders: await get_demo_orders(!all) });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.fake === true) {
    if (!(await is_staff())) {
      return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
    }
    const samples: order_item[] = [
      { menu_id: 'original-black', name: 'чёрный сахар', price: 390, quantity: 1 },
      { menu_id: 'mt-1', name: 'матча латте', price: 320, quantity: 1 },
    ];
    const order = await create_fake_order_from_items(samples, body.pickup_minutes ?? 8);
    return NextResponse.json({ order });
  }

  const items = body.items as order_item[] | undefined;
  if (!items?.length) {
    return NextResponse.json({ error: 'корзина пуста' }, { status: 400 });
  }

  const pickup_time = body.pickup_time as string | undefined;
  const phone = normalize_phone(body.customer_phone);
  const redeem_bonus = Boolean(body.redeem_bonus);
  let bonus_redeemed = 0;
  let bonus_balance: number | null = null;
  let is_paid = Boolean(body.is_paid);

  if (redeem_bonus) {
    if (!phone) {
      return NextResponse.json(
        { error: 'нужен телефон, чтобы списать бобаллы' },
        { status: 400 }
      );
    }
    await ensure_demo_bonus_row({
      phone,
      name: body.customer_name,
      seed:
        typeof body.client_bonus === 'number'
          ? Math.max(0, Math.floor(body.client_bonus))
          : FREE_DRINK_BONUS_THRESHOLD,
    });
    // если в сторе меньше, чем у клиента в профиле — подтянуть
    if (typeof body.client_bonus === 'number') {
      const { get_demo_bonus, upsert_demo_bonus } = await import('@/lib/demo-bonus-server');
      const row = await get_demo_bonus(phone);
      const client_bal = Math.max(0, Math.floor(body.client_bonus));
      if (row && row.bonus_balance < client_bal) {
        await upsert_demo_bonus({
          phone,
          name: body.customer_name,
          bonus_balance: client_bal,
        });
      }
    }
    const result = await redeem_bonus_points({
      phone,
      amount: FREE_DRINK_BONUS_THRESHOLD,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, bonus_balance: result.bonus_balance },
        { status: result.status }
      );
    }
    bonus_redeemed = result.redeemed;
    bonus_balance = result.bonus_balance;
    is_paid = true;
  }

  const order = await create_fake_order_from_items(
    items,
    body.pickup_minutes ?? 12,
    pickup_time,
    {
      name: body.customer_name,
      phone: phone || undefined,
      is_paid,
    }
  );

  if (redeem_bonus) {
    const { update_demo_order } = await import('@/lib/demo-orders-server');
    await update_demo_order(order.id, {
      total_price: 0,
      payment_type: 'bonus',
      is_paid: true,
    });
    order.total_price = 0;
    order.payment_type = 'bonus';
    order.is_paid = true;
  }

  // бобаллы только после оплаты; при создании обычного заказа — 0
  let bonus_earned = 0;
  if (!redeem_bonus && is_paid && phone) {
    const earned = await earn_bonus_for_paid_order({
      order_id: order.id,
      customer_phone: phone,
      customer_name: body.customer_name,
      items: items.map((i) => ({
        menu_id: i.menu_id,
        quantity: i.quantity,
      })),
      payment_type: order.payment_type,
      is_paid: true,
      actor: 'demo',
    });
    bonus_earned = earned.earned;
    if (typeof earned.bonus_balance === 'number') bonus_balance = earned.bonus_balance;
  }

  return NextResponse.json({
    order,
    bonus_redeemed,
    bonus_earned,
    bonus_balance,
  });
}

export async function PATCH(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const updated = await update_demo_order(body.id, body.patch);
  if (!updated) {
    return NextResponse.json({ error: 'заказ не найден' }, { status: 404 });
  }

  let bonus_earned = 0;
  let bonus_balance: number | null = null;
  if (body.patch?.is_paid) {
    const earned = await earn_bonus_for_paid_order({
      order_id: updated.id,
      user_id: updated.user_id,
      customer_phone: updated.customer_phone,
      customer_name: updated.customer_name,
      items: (updated.items || []).map((i) => ({
        menu_id: i.menu_id,
        quantity: i.quantity,
        kind: i.kind,
      })),
      payment_type: updated.payment_type,
      is_paid: true,
      actor: 'demo',
    });
    bonus_earned = earned.earned;
    bonus_balance = earned.bonus_balance;
  }

  return NextResponse.json({ order: updated, bonus_earned, bonus_balance });
}
