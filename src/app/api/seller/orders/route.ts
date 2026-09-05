import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { calc_order_bonus } from '@/lib/cart-summary';
import { create_fake_order_from_items, update_demo_order } from '@/lib/demo-orders-server';
import { load_menu_map } from '@/lib/kitchen-server';
import { allocate_daily_order_number, moscow_today_iso } from '@/lib/order-number';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { clear_order_prep } from '@/lib/seller-prep-server';
import type { order, order_item } from '@/lib/types';
import { student_line_price } from '@/lib/student-discount';
import {
  read_student_status,
  set_student_verified,
  staff_actor_name,
} from '@/lib/student-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

async function find_profile_by_phone(phone: string) {
  if (!is_supabase_configured()) return null;
  const admin = create_service_client();
  const full = await admin
    .from('profiles')
    .select(
      'id, name, phone, bonus_balance, student_claimed, student_verified, student_verified_at, student_verified_by'
    )
    .eq('phone', phone)
    .maybeSingle();
  const data = full.error
    ? (
        await admin
          .from('profiles')
          .select('id, name, phone, bonus_balance')
          .eq('phone', phone)
          .maybeSingle()
      ).data
    : full.data;
  return data as {
    id: string;
    name: string | null;
    phone: string | null;
    bonus_balance: number | null;
    student_claimed?: boolean | null;
    student_verified?: boolean | null;
    student_verified_at?: string | null;
    student_verified_by?: string | null;
  } | null;
}

async function customer_payload(profile: {
  id: string;
  name: string | null;
  phone: string | null;
  bonus_balance: number | null;
  student_claimed?: boolean | null;
  student_verified?: boolean | null;
  student_verified_at?: string | null;
  student_verified_by?: string | null;
}) {
  const student = await read_student_status({ user_id: profile.id, phone: profile.phone });
  return {
    id: profile.id,
    name: (profile.name || '').trim() || null,
    phone: profile.phone,
    bonus_balance: profile.bonus_balance ?? 0,
    student_claimed: student.student_claimed || profile.student_claimed === true,
    student_verified: student.student_verified || profile.student_verified === true,
    student_verified_at: student.student_verified_at || profile.student_verified_at || null,
    student_verified_by: student.student_verified_by || profile.student_verified_by || null,
  };
}
async function resolve_walk_in_user_id(
  customer_name: string,
  customer_phone: string | null
): Promise<{ user_id: string; bonus_earned_base: boolean }> {
  const admin = create_service_client();

  if (customer_phone) {
    const existing = await find_profile_by_phone(customer_phone);
    if (existing) return { user_id: existing.id, bonus_earned_base: true };
  }

  const email = `walkin-${crypto.randomUUID()}@yoboba.internal`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      name: customer_name,
      phone: customer_phone || undefined,
    },
  });

  if (error || !created.user) {
    throw new Error(error?.message || 'не удалось создать гостя точки');
  }

  const user_id = created.user.id;
  await admin.from('profiles').upsert(
    {
      id: user_id,
      name: customer_name,
      phone: customer_phone,
      bonus_balance: 0,
      role: 'user',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  return { user_id, bonus_earned_base: Boolean(customer_phone) };
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('completed') === '1') {
    const day = url.searchParams.get('day') || moscow_today_iso();
    const seller_id = url.searchParams.get('seller_id') || undefined;

    // тот же фильтр, что аналитика: уникальные fulfillment за shift_date (+ seller)
    const { get_fulfillment_order_ids } = await import('@/lib/prep-stats-server');
    const { get_handed_orders } = await import('@/lib/handed-orders-server');
    const ids = await get_fulfillment_order_ids({ shift_date: day, seller_id });
    const handed_snapshots = await get_handed_orders({ shift_date: day, seller_id });
    const by_id = new Map<string, order>();
    for (const o of handed_snapshots) {
      by_id.set(o.id, { ...o, status: 'completed' });
    }

    let completed: order[] = [];

    if (ids.length > 0) {
      const missing = ids.filter((id) => !by_id.has(id));
      if (missing.length) {
        const { get_demo_orders } = await import('@/lib/demo-orders-server');
        for (const o of await get_demo_orders(false)) {
          if (missing.includes(o.id)) by_id.set(o.id, { ...o, status: 'completed' });
        }
        if (is_supabase_configured()) {
          const admin = create_service_client();
          const { data } = await admin.from('orders').select('*').in('id', missing);
          for (const row of (data as order[]) || []) {
            by_id.set(row.id, { ...row, status: 'completed', is_paid: Boolean(row.is_paid) });
          }
        }
      }
      completed = ids
        .map((id) => by_id.get(id))
        .filter(Boolean) as order[];
    } else if (handed_snapshots.length > 0) {
      // журнал есть, events ещё не поднялись — не раздуваем legacy order_day
      completed = handed_snapshots;
    }

    completed.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({ orders: completed });
  }

  const raw = url.searchParams.get('phone');
  const phone = normalize_phone(raw);
  const user_id = url.searchParams.get('user_id') || undefined;

  if (!phone && !user_id) {
    return NextResponse.json({ customer: null });
  }

  if (user_id && is_supabase_configured()) {
    const admin = create_service_client();
    const { data: by_id } = await admin
      .from('profiles')
      .select('id, name, phone, bonus_balance')
      .eq('id', user_id)
      .maybeSingle();
    if (by_id) {
      return NextResponse.json({
        phone: by_id.phone,
        customer: await customer_payload(by_id),
      });
    }
  }

  if (!phone) {
    return NextResponse.json({ customer: null });
  }

  const profile = await find_profile_by_phone(phone);
  if (profile) {
    return NextResponse.json({
      phone,
      customer: await customer_payload(profile),
    });
  }

  const { get_demo_bonus } = await import('@/lib/demo-bonus-server');
  const demo = await get_demo_bonus(phone);
  if (demo) {
    const student = await read_student_status({ phone });
    return NextResponse.json({
      phone,
      customer: {
        id: `demo-${phone}`,
        name: (demo.name || '').trim() || null,
        phone: demo.phone,
        bonus_balance: demo.bonus_balance,
        ...student,
      },
    });
  }

  return NextResponse.json({ customer: null, phone });
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const raw_items = body.items as order_item[] | undefined;
  if (!raw_items?.length) {
    return NextResponse.json({ error: 'корзина пуста' }, { status: 400 });
  }

  const menu = await load_menu_map();
  const customer_phone = normalize_phone(body.customer_phone as string | undefined);
  const raw_confirm_student = Boolean(body.confirm_student);
  let student_verified = false;
  if (customer_phone) {
    let student = await read_student_status({ phone: customer_phone });
    if (raw_confirm_student && !student.student_verified) {
      student = await set_student_verified({
        phone: customer_phone,
        verified: true,
        by: await staff_actor_name(),
      });
    }
    student_verified = student.student_verified;
  }

  const items: order_item[] = raw_items.map((row) => {
    const m = menu.get(row.menu_id);
    const base = m?.price ?? row.price;
    return {
      menu_id: row.menu_id,
      name: m?.name || row.name,
      price: student_line_price(base, { category: m?.category, menu_id: row.menu_id }, student_verified),
      quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
    };
  });

  const total_price = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const pickup_minutes = Math.max(5, Math.min(60, Number(body.pickup_minutes) || 10));
  let is_paid = Boolean(body.is_paid);
  let payment_type =
    (body.payment_type as 'cash' | 'card' | 'bonus' | 'online') || 'cash';
  const redeem_bonus = Boolean(body.redeem_bonus);
  const pickup_time =
    (body.pickup_time as string | undefined) ||
    new Date(Date.now() + pickup_minutes * 60_000).toISOString();

  let customer_name =
    (body.customer_name as string | undefined)?.trim() || 'гость точки';
  let user_id: string | null = null;
  let bonus_earned = 0;
  let can_earn_bonus = false;
  let bonus_redeemed = 0;
  let bonus_balance: number | null = null;
  let final_total = total_price;

  if (customer_phone) {
    const profile = await find_profile_by_phone(customer_phone);
    if (profile) {
      user_id = profile.id;
      can_earn_bonus = true;
      const profile_name = (profile.name || '').trim();
      if (profile_name) customer_name = profile_name;
      bonus_balance = profile.bonus_balance ?? 0;
      bonus_earned = calc_order_bonus(
        items.map((i) => ({
          menu_id: i.menu_id,
          quantity: i.quantity,
          category: menu.get(i.menu_id)?.category,
        }))
      );
    }
  }

  if (redeem_bonus) {
    if (!customer_phone) {
      return NextResponse.json(
        { error: 'нужен телефон гостя, чтобы списать бобаллы' },
        { status: 400 }
      );
    }
    const { redeem_bonus_points, ensure_demo_bonus_row } = await import(
      '@/lib/bonus-server'
    );
    const { FREE_DRINK_BONUS_THRESHOLD } = await import('@/lib/cart-summary');
    if (!is_supabase_configured()) {
      await ensure_demo_bonus_row({
        phone: customer_phone,
        name: customer_name,
        seed: FREE_DRINK_BONUS_THRESHOLD,
      });
    }
    const result = await redeem_bonus_points({
      user_id,
      phone: customer_phone,
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
    final_total = 0;
    is_paid = true;
    payment_type = 'bonus';
    can_earn_bonus = false;
    bonus_earned = 0;
  }

  if (is_supabase_configured()) {
    try {
      const admin = create_service_client();
      if (!user_id) {
        const resolved = await resolve_walk_in_user_id(customer_name, customer_phone);
        user_id = resolved.user_id;
      }

      const daily = await allocate_daily_order_number(admin);
      const payload = {
        user_id,
        items,
        total_price: final_total,
        payment_type: payment_type === 'bonus' ? 'online' : payment_type,
        is_paid,
        customer_name,
        customer_phone,
        pickup_time,
        status: 'new' as const,
        order_number: daily.order_number,
        order_day: daily.order_day,
      };

      let { data, error } = await admin.from('orders').insert(payload).select('*').single();

      if (error && /is_paid|customer_name|customer_phone|payment_type/i.test(error.message)) {
        const retry = await admin
          .from('orders')
          .insert({
            user_id,
            items,
            total_price: final_total,
            payment_type: payment_type === 'bonus' ? 'online' : payment_type,
            pickup_time,
            status: 'new',
            order_number: daily.order_number,
            order_day: daily.order_day,
          })
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data) {
        if (bonus_earned > 0 && can_earn_bonus && user_id) {
          const { data: profile } = await admin
            .from('profiles')
            .select('bonus_balance')
            .eq('id', user_id)
            .maybeSingle();
          const current = (profile?.bonus_balance as number | null) ?? 0;
          bonus_balance = current + bonus_earned;
          await admin
            .from('profiles')
            .update({
              bonus_balance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user_id);
        }
        return NextResponse.json({
          order: {
            ...data,
            customer_name,
            customer_phone,
            is_paid,
            payment_type,
            total_price: final_total,
          },
          bonus_earned: can_earn_bonus ? bonus_earned : 0,
          bonus_redeemed,
          bonus_balance,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'не удалось создать заказ';
      if (!message.includes('гостя точки') && !/auth/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  }

  const order = await create_fake_order_from_items(items, pickup_minutes, pickup_time, {
    name: customer_name,
    phone: customer_phone || undefined,
    is_paid,
  });

  if (redeem_bonus) {
    await update_demo_order(order.id, {
      total_price: 0,
      payment_type: 'bonus',
      is_paid: true,
    });
    order.total_price = 0;
    order.payment_type = 'bonus';
    order.is_paid = true;
  } else if (customer_phone) {
    const { get_demo_bonus, upsert_demo_bonus } = await import('@/lib/demo-bonus-server');
    const { FREE_DRINK_BONUS_THRESHOLD } = await import('@/lib/cart-summary');
    const existing = await get_demo_bonus(customer_phone);
    const earned = calc_order_bonus(
      items.map((i) => ({
        menu_id: i.menu_id,
        quantity: i.quantity,
        category: menu.get(i.menu_id)?.category,
      }))
    );
    bonus_earned = earned;
    const next = await upsert_demo_bonus({
      phone: customer_phone,
      name: customer_name,
      bonus_balance: (existing?.bonus_balance ?? FREE_DRINK_BONUS_THRESHOLD) + earned,
    });
    bonus_balance = next.bonus_balance;
  }

  return NextResponse.json({
    order,
    bonus_earned,
    bonus_redeemed,
    bonus_balance,
  });
}

export async function PATCH(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = await request.json();
  const id = body.id as string | undefined;
  const patch = body.patch as Partial<order> | undefined;
  if (!id || !patch || typeof patch !== 'object') {
    return NextResponse.json({ error: 'неверные данные' }, { status: 400 });
  }

  if (id.startsWith('demo-order')) {
    const updated = await update_demo_order(id, patch);
    if (!updated) {
      return NextResponse.json({ error: 'заказ не найден' }, { status: 404 });
    }
    if (patch.status === 'completed') {
      await clear_order_prep(id);
    }
    return NextResponse.json({ order: updated });
  }

  if (!is_supabase_configured()) {
    return NextResponse.json({ error: 'supabase не настроен' }, { status: 500 });
  }

  const admin = create_service_client();
  let { data, error } = await admin.from('orders').update(patch).eq('id', id).select('*').single();

  if (error && /is_paid|customer_/i.test(error.message)) {
    const { is_paid: dropped_paid, customer_name: _n, customer_phone: _ph, ...rest } = patch;
    if (Object.keys(rest).length) {
      const retry = await admin.from('orders').update(rest).eq('id', id).select('*').single();
      data = retry.data;
      error = retry.error;
      // колонка is_paid ещё не в схеме — отдаём клиенту оплаченный снимок, чтобы UI не откатывался
      if (!error && dropped_paid != null && data) {
        data = { ...data, is_paid: Boolean(dropped_paid) };
      }
    } else if (patch.is_paid != null) {
      // только is_paid — всё равно подтверждаем клиенту
      const { data: current } = await admin.from('orders').select('*').eq('id', id).single();
      return NextResponse.json({
        order: current ? { ...current, is_paid: Boolean(patch.is_paid) } : { id, ...patch },
        warning: error.message,
      });
    } else {
      return NextResponse.json({ order: null, warning: error.message });
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (patch.status === 'completed') {
    await clear_order_prep(id);
  }

  if (patch.status && data) {
    const { push_order_status_to_user } = await import('@/lib/push-order-status');
    void push_order_status_to_user(data as order).catch(() => {});
  }

  return NextResponse.json({ order: data });
}
