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
import { discounted_unit, parse_discount } from '@/lib/pos-pricing';
import { record_order_stock, release_order_stock } from '@/lib/finance/order-stock';
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

const POS_WALKIN_EMAIL = 'walkin@yoboba.internal';
const WALKIN_STORE = 'pos-walkin-user';
let walkin_user: Promise<string> | null = null;

async function pos_guest_user_id(): Promise<string> {
  if (!walkin_user) {
    walkin_user = (async () => {
      const { read_json_store, write_json_store } = await import('@/lib/data-store');
      const stored = await read_json_store<string | null>(WALKIN_STORE, null);
      if (stored) return stored;

      const admin = create_service_client();
      const created = await admin.auth.admin.createUser({
        email: POS_WALKIN_EMAIL,
        email_confirm: true,
        user_metadata: { name: 'гость' },
      });
      let uid = created.data?.user?.id || '';
      if (!uid && /already|registered|exists|duplicate/i.test(created.error?.message || '')) {
        const { data: existing } = await admin
          .from('profiles')
          .select('id')
          .eq('name', 'гость')
          .is('phone', null)
          .limit(1)
          .maybeSingle();
        uid = existing?.id || '';
      }
      if (!uid) throw new Error(created.error?.message || 'не удалось создать гостя точки');
      await admin.from('profiles').upsert(
        {
          id: uid,
          name: 'гость',
          phone: null,
          bonus_balance: 0,
          role: 'user',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      await write_json_store(WALKIN_STORE, uid).catch(() => {});
      return uid;
    })().catch((e) => {
      walkin_user = null;
      throw e;
    });
  }
  return walkin_user;
}

async function resolve_walk_in_user_id(
  customer_name: string,
  customer_phone: string | null
): Promise<{ user_id: string; bonus_earned_base: boolean }> {
  if (customer_phone) {
    const existing = await find_profile_by_phone(customer_phone);
    if (existing) return { user_id: existing.id, bonus_earned_base: true };

    const admin = create_service_client();
    const email = `walkin-${crypto.randomUUID()}@yoboba.internal`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name: customer_name,
        phone: customer_phone,
      },
    });

    if (error || !created.user) {
      throw new Error(error?.message || 'не удалось создать гостя точки');
    }

    const user_id = created.user.id;
    const { error: profile_err } = await admin.from('profiles').upsert(
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

    if (profile_err) {
      const existing_phone = await find_profile_by_phone(customer_phone);
      if (existing_phone) {
        await admin.auth.admin.deleteUser(user_id).catch(() => {});
        return { user_id: existing_phone.id, bonus_earned_base: true };
      }
      await admin.auth.admin.deleteUser(user_id).catch(() => {});
      throw new Error(`не удалось создать профиль гостя: ${profile_err.message}`);
    }

    return { user_id, bonus_earned_base: true };
  }

  return { user_id: await pos_guest_user_id(), bonus_earned_base: false };
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('completed') === '1') {
    const day = url.searchParams.get('day') || moscow_today_iso();
    const { completed_orders_for_day } = await import('@/lib/cashier-sales-server');
    const { get_handed_orders } = await import('@/lib/handed-orders-server');
    const [from_orders, handed_snapshots] = await Promise.all([
      completed_orders_for_day(day),
      get_handed_orders({ shift_date: day }),
    ]);
    const by_id = new Map<string, order>();
    for (const order of from_orders) by_id.set(order.id, order);
    for (const order of handed_snapshots) {
      if (!by_id.has(order.id)) by_id.set(order.id, { ...order, status: 'completed' });
    }
    const completed = [...by_id.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({ orders: completed });
  }

  const raw_code = url.searchParams.get('code');
  if (raw_code) {
    const {
      parse_pickup_code_input,
      pickup_lookup_allowed,
      resolve_pickup_code,
    } = await import('@/lib/pickup-code-server');
    const code = parse_pickup_code_input(raw_code);
    if (!code) {
      return NextResponse.json({ customer: null, error: 'код должен быть из 6 цифр' }, { status: 400 });
    }
    const rate_key = `seller-code:${(await cookies()).get(session_cookie)?.value || 'anon'}`;
    if (!pickup_lookup_allowed(rate_key)) {
      return NextResponse.json(
        { customer: null, error: 'слишком много попыток — подождите минуту' },
        { status: 429 }
      );
    }
    const resolved = await resolve_pickup_code(code);
    if (!resolved) {
      const { pickup_code_miss_reason } = await import('@/lib/pickup-code-server');
      const reason = await pickup_code_miss_reason(code);
      console.error('[pickup] seller lookup miss', code, reason);
      return NextResponse.json({
        customer: null,
        code,
        error: reason,
      });
    }
    console.info(
      '[pickup] seller lookup ok',
      code,
      resolved.user_id,
      resolved.name,
      resolved.phone,
      resolved.bonus_balance
    );
    if (is_supabase_configured()) {
      const admin = create_service_client();
      const full = await admin
        .from('profiles')
        .select(
          'id, name, phone, bonus_balance, student_claimed, student_verified, student_verified_at, student_verified_by'
        )
        .eq('id', resolved.user_id)
        .maybeSingle();
      const profile = full.error
        ? (
            await admin
              .from('profiles')
              .select('id, name, phone, bonus_balance')
              .eq('id', resolved.user_id)
              .maybeSingle()
          ).data
        : full.data;
      if (profile) {
        return NextResponse.json({
          phone: profile.phone,
          code,
          customer: await customer_payload(profile),
        });
      }
    }
    const student = await read_student_status({
      user_id: resolved.user_id,
      phone: resolved.phone,
    });
    return NextResponse.json({
      phone: resolved.phone,
      code,
      customer: {
        id: resolved.user_id,
        name: (resolved.name || '').trim() || null,
        phone: resolved.phone,
        bonus_balance: resolved.bonus_balance,
        ...student,
      },
    });
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

  // демо-баланс только без supabase: иначе касса покажет цифру из локального файла
  const { get_demo_bonus } = await import('@/lib/demo-bonus-server');
  const demo = is_supabase_configured() ? null : await get_demo_bonus(phone);
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
  const pickup_code_raw = body.pickup_code as string | undefined;
  let customer_phone = normalize_phone(body.customer_phone as string | undefined);
  let pickup_code_used: string | null = null;
  let pickup_user_id: string | null = null;

  if (pickup_code_raw) {
    const { parse_pickup_code_input, resolve_pickup_code } = await import(
      '@/lib/pickup-code-server'
    );
    const code = parse_pickup_code_input(pickup_code_raw);
    if (!code) {
      return NextResponse.json({ error: 'код должен быть из 6 цифр' }, { status: 400 });
    }
    const resolved = await resolve_pickup_code(code);
    if (!resolved) {
      return NextResponse.json({ error: 'код не найден или устарел' }, { status: 400 });
    }
    pickup_code_used = code;
    pickup_user_id = resolved.user_id;
    if (!customer_phone && resolved.phone) {
      customer_phone = normalize_phone(resolved.phone);
    }
  }

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
  } else if (pickup_user_id) {
    let student = await read_student_status({ user_id: pickup_user_id });
    if (raw_confirm_student && !student.student_verified) {
      student = await set_student_verified({
        user_id: pickup_user_id,
        verified: true,
        by: await staff_actor_name(),
      });
    }
    student_verified = student.student_verified;
  }

  const staff = Boolean(body.staff);
  const discount = staff ? null : parse_discount(body.discount);
  const items: order_item[] = (() => {
    const configured = raw_items.map((row) => {
      const m = menu.get(row.menu_id);
      const qty = Math.max(1, Math.round(Number(row.quantity) || 1));
      const configured_unit = Math.max(0, Math.round(Number(row.price) || m?.price || 0));
      const volume = typeof row.volume === 'string' && /^\d+$/.test(row.volume) ? row.volume : undefined;
      return {
        menu_id: row.menu_id,
        name: row.name || m?.name || 'напиток',
        configured_unit,
        quantity: qty,
        volume,
        category: m?.category,
      };
    });
    const lines = configured.map((c) => ({
      unit: student_line_price(c.configured_unit, { category: c.category, menu_id: c.menu_id }, student_verified && !staff),
      qty: c.quantity,
    }));
    return configured.map((c, i) => ({
      menu_id: c.menu_id,
      name: c.name,
      price: discounted_unit(lines, i, discount, staff),
      quantity: c.quantity,
      ...(c.volume ? { volume: c.volume } : {}),
      kind: staff ? ('staff' as const) : ('sale' as const),
    }));
  })();

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
  if (staff) {
    customer_name = (body.seller_name as string | undefined)?.trim() || 'персонал';
  }
  let user_id: string | null = null;
  let bonus_earned = 0;
  let can_earn_bonus = false;
  let bonus_redeemed = 0;
  let bonus_balance: number | null = null;
  let final_total = total_price;
  const bonus_for_items = calc_order_bonus(
    items.map((i) => ({
      menu_id: i.menu_id,
      quantity: i.quantity,
      category: menu.get(i.menu_id)?.category,
    }))
  );

  if (customer_phone) {
    const profile = await find_profile_by_phone(customer_phone);
    if (profile) {
      user_id = profile.id;
      const profile_name = (profile.name || '').trim();
      if (profile_name) customer_name = profile_name;
      bonus_balance = profile.bonus_balance ?? 0;
    }
    // баллы копятся на телефон: и найденному гостю, и новому (профиль создадим ниже)
    can_earn_bonus = true;
    bonus_earned = bonus_for_items;
  } else if (pickup_user_id) {
    user_id = pickup_user_id;
    can_earn_bonus = true;
    bonus_earned = bonus_for_items;
    if (is_supabase_configured()) {
      const admin = create_service_client();
      const { data: by_id } = await admin
        .from('profiles')
        .select('id, name, phone, bonus_balance')
        .eq('id', pickup_user_id)
        .maybeSingle();
      if (by_id) {
        const profile_name = (by_id.name || '').trim();
        if (profile_name) customer_name = profile_name;
        bonus_balance = by_id.bonus_balance ?? 0;
        if (!customer_phone) customer_phone = normalize_phone(by_id.phone);
      }
    }
  }
  if (staff) {
    customer_name = (body.seller_name as string | undefined)?.trim() || 'персонал';
    can_earn_bonus = false;
    bonus_earned = 0;
  }

  const { redeem_bonus_points, refund_bonus_points, earn_bonus_points, ensure_demo_bonus_row } =
    await import('@/lib/bonus-server');
  const { FREE_DRINK_BONUS_THRESHOLD } = await import('@/lib/cart-summary');
  const actor = await staff_actor_name();
  // если после списания заказ не создался — баллы возвращаем, а не теряем
  let redeemed_from_user: string | null = null;
  const refund_redeemed = async (why: string) => {
    if (!redeemed_from_user || bonus_redeemed <= 0) return;
    const back = await refund_bonus_points({
      user_id: redeemed_from_user,
      amount: bonus_redeemed,
      reason: `refund:${why}`,
      actor,
    });
    if (back.ok) bonus_balance = back.bonus_balance;
    redeemed_from_user = null;
  };

  if (redeem_bonus) {
    if (staff) {
      return NextResponse.json({ error: 'напиток персонала нельзя оплатить бобаллами' }, { status: 400 });
    }
    if (!customer_phone && !pickup_user_id) {
      return NextResponse.json(
        { error: 'нужен телефон или код гостя, чтобы списать бобаллы' },
        { status: 400 }
      );
    }
    if (!is_supabase_configured() && customer_phone) {
      await ensure_demo_bonus_row({
        phone: customer_phone,
        name: customer_name,
        seed: FREE_DRINK_BONUS_THRESHOLD,
      });
    }
    const result = await redeem_bonus_points({
      user_id: user_id || pickup_user_id,
      phone: customer_phone,
      amount: FREE_DRINK_BONUS_THRESHOLD,
      actor,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, bonus_balance: result.bonus_balance },
        { status: result.status }
      );
    }
    bonus_redeemed = result.redeemed;
    bonus_balance = result.bonus_balance;
    if (is_supabase_configured()) {
      redeemed_from_user = result.customer.id;
      if (!user_id) user_id = result.customer.id;
    }
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
        can_earn_bonus = can_earn_bonus && resolved.bonus_earned_base;
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

      if (error || !data) {
        await refund_redeemed('order_insert_failed');
        return NextResponse.json(
          { error: error?.message || 'не удалось создать заказ', bonus_balance },
          { status: 500 }
        );
      }

      let earned_now = 0;
      if (bonus_earned > 0 && can_earn_bonus && user_id) {
        const earned = await earn_bonus_points({
          user_id,
          amount: bonus_earned,
          order_id: (data as { id?: string }).id ?? null,
          actor,
        });
        if (earned.ok) {
          bonus_balance = earned.bonus_balance;
          earned_now = bonus_earned;
        } else {
          console.error('seller order: bonus earn failed', user_id, earned.error);
        }
      }

      void record_order_stock({
        orderId: String((data as { id?: string }).id || ''),
        items,
        kind: staff ? 'staff' : 'sale',
      });

      // сжигаем код только если заказ привязали по pickup-коду
      // (заказ по телефону раньше убивал QR на экране гостя)
      if (pickup_code_used && !staff) {
        const { invalidate_pickup_code } = await import('@/lib/pickup-code-server');
        await invalidate_pickup_code({
          code: pickup_code_used,
          user_id: user_id || pickup_user_id,
        });
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
        bonus_earned: earned_now,
        bonus_redeemed,
        bonus_balance,
        bonus_warning: bonus_earned > 0 && can_earn_bonus && !earned_now
          ? 'заказ создан, но бобаллы не начислились — проверьте гостя'
          : undefined,
      });
    } catch (e) {
      // supabase настроен — в демо-стор не уходим: баллы там не сохраняются
      const message = e instanceof Error ? e.message : 'не удалось создать заказ';
      await refund_redeemed('order_failed');
      console.error('seller order failed', message);
      return NextResponse.json({ error: message, bonus_balance }, { status: 500 });
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

  void record_order_stock({
    orderId: order.id,
    items,
    kind: staff ? 'staff' : 'sale',
  });

  if (pickup_code_used && !staff) {
    const { invalidate_pickup_code } = await import('@/lib/pickup-code-server');
    await invalidate_pickup_code({
      code: pickup_code_used,
      user_id: user_id || pickup_user_id,
    });
  }

  return NextResponse.json({
    order,
    bonus_earned: staff ? 0 : bonus_earned,
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
    if (patch.status === 'cancelled') {
      await release_order_stock(id);
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
  if (patch.status === 'cancelled') {
    await release_order_stock(id);
  }

  if (patch.status && data) {
    const { push_order_status_to_user } = await import('@/lib/push-order-status');
    void push_order_status_to_user(data as order).catch(() => {});
  }

  return NextResponse.json({ order: data });
}
