import type { SupabaseClient } from '@supabase/supabase-js';
import { calc_order_bonus, FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import {
  earn_demo_bonus,
  get_demo_bonus,
  redeem_demo_bonus,
  upsert_demo_bonus,
} from '@/lib/demo-bonus-server';

export type bonus_profile = {
  id: string;
  name: string | null;
  phone: string | null;
  bonus_balance: number | null;
};

export type adjust_result =
  | { ok: true; bonus_balance: number }
  | { ok: false; error: string; status: number; bonus_balance?: number };

type admin_client = SupabaseClient;

function is_missing_rpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

/**
 * атомарно изменить баланс бобаллов и записать операцию в журнал.
 * основной путь — rpc adjust_bonus_balance (supabase/bonus-ledger.sql).
 * если функция ещё не выкатана — optimistic-update с проверкой старого значения.
 */
export async function adjust_bonus_balance(
  admin: admin_client,
  input: {
    user_id: string;
    delta: number;
    reason: string;
    order_id?: string | null;
    actor?: string | null;
  }
): Promise<adjust_result> {
  const delta = Math.round(input.delta);

  const rpc = await admin.rpc('adjust_bonus_balance', {
    p_user_id: input.user_id,
    p_delta: delta,
    p_reason: input.reason,
    p_order_id: input.order_id ?? null,
    p_actor: input.actor ?? null,
  });

  if (!rpc.error) {
    return { ok: true, bonus_balance: Number(rpc.data) || 0 };
  }

  if (!is_missing_rpc(rpc.error)) {
    const msg = rpc.error.message || '';
    if (msg.includes('insufficient_bonus')) {
      const { data } = await admin
        .from('profiles')
        .select('bonus_balance')
        .eq('id', input.user_id)
        .maybeSingle();
      const current = Number(data?.bonus_balance) || 0;
      return {
        ok: false,
        error: `не хватает бобаллов: есть ${current}, нужно ${Math.abs(delta)}`,
        status: 400,
        bonus_balance: current,
      };
    }
    if (msg.includes('profile_not_found')) {
      return { ok: false, error: 'гость не найден', status: 404 };
    }
    return { ok: false, error: msg || 'не удалось изменить баланс', status: 500 };
  }

  // fallback без rpc: compare-and-set, чтобы параллельные заказы не затирали друг друга
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await admin
      .from('profiles')
      .select('bonus_balance')
      .eq('id', input.user_id)
      .maybeSingle();
    if (error) return { ok: false, error: error.message, status: 500 };
    if (!data) return { ok: false, error: 'гость не найден', status: 404 };

    const current = Number(data.bonus_balance) || 0;
    const next = current + delta;
    if (next < 0) {
      return {
        ok: false,
        error: `не хватает бобаллов: есть ${current}, нужно ${Math.abs(delta)}`,
        status: 400,
        bonus_balance: current,
      };
    }
    if (delta === 0) return { ok: true, bonus_balance: current };

    const upd = await admin
      .from('profiles')
      .update({ bonus_balance: next, updated_at: new Date().toISOString() })
      .eq('id', input.user_id)
      .eq('bonus_balance', current)
      .select('id');
    if (upd.error) return { ok: false, error: upd.error.message, status: 500 };
    if ((upd.data || []).length > 0) return { ok: true, bonus_balance: next };
    // кто-то успел изменить баланс между чтением и записью — повторяем
  }

  return { ok: false, error: 'баланс меняется параллельно, попробуйте ещё раз', status: 409 };
}

/** найти профиль по нормализованному телефону */
export async function find_profile_by_phone(
  admin: admin_client,
  raw_phone: string | null | undefined
): Promise<bonus_profile | null> {
  const phone = normalize_phone(raw_phone);
  if (!phone) return null;
  const { data, error } = await admin
    .from('profiles')
    .select('id, name, phone, bonus_balance')
    .eq('phone', phone)
    .maybeSingle();
  if (error) return null;
  return (data as bonus_profile | null) ?? null;
}

export type redeem_result =
  | {
      ok: true;
      redeemed: number;
      bonus_balance: number;
      customer: {
        id: string;
        name: string | null;
        phone: string | null;
        bonus_balance: number;
      };
    }
  | { ok: false; error: string; status: number; bonus_balance?: number };

/** списать бобаллы у гостя (supabase или демо-стор) */
export async function redeem_bonus_points(input: {
  user_id?: string | null;
  phone?: string | null;
  amount?: number;
  order_id?: string | null;
  actor?: string | null;
}): Promise<redeem_result> {
  const amount = Math.max(
    1,
    Math.floor(input.amount ?? FREE_DRINK_BONUS_THRESHOLD)
  );
  const phone = normalize_phone(input.phone);

  if (is_supabase_configured()) {
    const admin = create_service_client();
    let profile: bonus_profile | null = null;

    if (input.user_id) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, name, phone, bonus_balance')
        .eq('id', input.user_id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, status: 500 };
      profile = data;
    }

    if (!profile && phone) {
      profile = await find_profile_by_phone(admin, phone);
    }

    if (!profile) {
      return { ok: false, error: 'гость не найден', status: 404 };
    }

    const result = await adjust_bonus_balance(admin, {
      user_id: profile.id,
      delta: -amount,
      reason: 'redeem',
      order_id: input.order_id ?? null,
      actor: input.actor ?? null,
    });
    if (!result.ok) return result;

    return {
      ok: true,
      redeemed: amount,
      bonus_balance: result.bonus_balance,
      customer: {
        id: profile.id,
        name: profile.name,
        phone: profile.phone,
        bonus_balance: result.bonus_balance,
      },
    };
  }

  if (!phone) {
    return {
      ok: false,
      error: 'нужен телефон гостя, чтобы списать бобаллы',
      status: 400,
    };
  }

  const demo = await get_demo_bonus(phone);
  if (!demo) {
    return { ok: false, error: 'гость не найден', status: 404 };
  }

  if (demo.bonus_balance < amount) {
    return {
      ok: false,
      error: `не хватает бобаллов: есть ${demo.bonus_balance}, нужно ${amount}`,
      status: 400,
      bonus_balance: demo.bonus_balance,
    };
  }

  const updated = await redeem_demo_bonus(phone, amount);
  if (!updated) {
    return { ok: false, error: 'не удалось списать', status: 500 };
  }

  return {
    ok: true,
    redeemed: amount,
    bonus_balance: updated.bonus_balance,
    customer: {
      id: `demo-${phone}`,
      name: updated.name,
      phone: updated.phone,
      bonus_balance: updated.bonus_balance,
    },
  };
}

/** вернуть списанные бобаллы, если заказ не удалось создать */
export async function refund_bonus_points(input: {
  user_id: string;
  amount: number;
  reason?: string;
  actor?: string | null;
}): Promise<adjust_result> {
  if (!is_supabase_configured()) {
    return { ok: false, error: 'supabase не настроен', status: 500 };
  }
  const admin = create_service_client();
  return adjust_bonus_balance(admin, {
    user_id: input.user_id,
    delta: Math.abs(Math.round(input.amount)),
    reason: input.reason || 'refund',
    actor: input.actor ?? null,
  });
}

/** начислить бобаллы за заказ */
export async function earn_bonus_points(input: {
  user_id: string;
  amount: number;
  order_id?: string | null;
  actor?: string | null;
}): Promise<adjust_result> {
  if (!is_supabase_configured()) {
    return { ok: false, error: 'supabase не настроен', status: 500 };
  }
  const amount = Math.round(input.amount);
  if (amount <= 0) {
    return { ok: false, error: 'нечего начислять', status: 400 };
  }
  const admin = create_service_client();
  return adjust_bonus_balance(admin, {
    user_id: input.user_id,
    delta: amount,
    reason: 'earn',
    order_id: input.order_id ?? null,
    actor: input.actor ?? null,
  });
}

export type earn_for_paid_result = {
  earned: number;
  bonus_balance: number | null;
  skipped?:
    | 'unpaid'
    | 'bonus_payment'
    | 'staff'
    | 'zero'
    | 'no_guest'
    | 'already'
    | 'failed';
  error?: string;
};

/**
 * начислить бобаллы только за оплаченный заказ.
 * идемпотентно по order_id (повторная оплата / PATCH не дублирует).
 * оплата бобаллами и напитки персонала — без начисления.
 */
export async function earn_bonus_for_paid_order(input: {
  order_id: string;
  user_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  items: Array<{
    menu_id: string;
    quantity: number;
    category?: string | null;
    kind?: string | null;
  }>;
  payment_type?: string | null;
  is_paid: boolean;
  /** заказ персонала — не копим */
  staff?: boolean;
  actor?: string | null;
}): Promise<earn_for_paid_result> {
  if (!input.is_paid) {
    return { earned: 0, bonus_balance: null, skipped: 'unpaid' };
  }
  if (input.staff || input.items.some((i) => i.kind === 'staff')) {
    return { earned: 0, bonus_balance: null, skipped: 'staff' };
  }
  if (input.payment_type === 'bonus') {
    return { earned: 0, bonus_balance: null, skipped: 'bonus_payment' };
  }

  const phone = normalize_phone(input.customer_phone);
  let lines = input.items.map((i) => ({
    menu_id: i.menu_id,
    quantity: i.quantity,
    category: i.category,
  }));
  if (lines.some((l) => !l.category)) {
    const { load_menu_map } = await import('@/lib/kitchen-server');
    const menu = await load_menu_map();
    lines = lines.map((l) => ({
      ...l,
      category: l.category ?? menu.get(l.menu_id)?.category,
    }));
  }

  const amount = calc_order_bonus(lines);
  if (amount <= 0) {
    return { earned: 0, bonus_balance: null, skipped: 'zero' };
  }

  if (is_supabase_configured()) {
    const admin = create_service_client();
    let user_id = input.user_id || null;

    if (!user_id && phone) {
      const profile = await find_profile_by_phone(admin, phone);
      user_id = profile?.id ?? null;
    }
    if (!user_id) {
      return { earned: 0, bonus_balance: null, skipped: 'no_guest' };
    }

    if (input.order_id) {
      const prior = await admin
        .from('bonus_transactions')
        .select('id')
        .eq('order_id', input.order_id)
        .eq('reason', 'earn')
        .limit(1);
      if (!prior.error && (prior.data || []).length > 0) {
        const { data: bal } = await admin
          .from('profiles')
          .select('bonus_balance')
          .eq('id', user_id)
          .maybeSingle();
        return {
          earned: 0,
          bonus_balance: Number(bal?.bonus_balance) || 0,
          skipped: 'already',
        };
      }
    }

    const result = await earn_bonus_points({
      user_id,
      amount,
      order_id: input.order_id,
      actor: input.actor ?? null,
    });
    if (!result.ok) {
      return {
        earned: 0,
        bonus_balance: result.bonus_balance ?? null,
        skipped: 'failed',
        error: result.error,
      };
    }
    return { earned: amount, bonus_balance: result.bonus_balance };
  }

  if (!phone) {
    return { earned: 0, bonus_balance: null, skipped: 'no_guest' };
  }

  const demo = await earn_demo_bonus({
    order_id: input.order_id,
    phone,
    name: input.customer_name,
    amount,
  });
  if (!demo) {
    return { earned: 0, bonus_balance: null, skipped: 'failed' };
  }
  return {
    earned: demo.earned,
    bonus_balance: demo.bonus_balance,
    skipped: demo.already ? 'already' : undefined,
  };
}

/** технический аккаунт: гость точки с кассы или гостевая сессия сайта */
export function is_service_account_email(email: string | null | undefined) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@yoboba.internal') || e.endsWith('@guest.yoboba.auth');
}

export type claim_phone_result =
  | {
      ok: true;
      merged_from: string | null;
      bonus_balance: number | null;
      /** забрали заказы с кассового гостя или технического профиля */
      linked_purchases: boolean;
    }
  | { ok: false; error: string; status: number };

/** заказы с этим телефоном, которые всё ещё висят на кассе или гостевой сессии */
async function pull_cashier_orders(
  admin: admin_client,
  phone: string,
  into_id: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('orders')
    .select('id, user_id')
    .eq('customer_phone', phone)
    .limit(500);
  if (error || !data?.length) return false;
  const rows = data as { id: string; user_id: string | null }[];
  const loose = rows.filter((r) => !r.user_id).map((r) => r.id);
  const foreign = rows.filter((r) => r.user_id && r.user_id !== into_id);
  let moved = false;
  if (loose.length) {
    const upd = await admin.from('orders').update({ user_id: into_id }).in('id', loose);
    if (!upd.error) moved = true;
  }
  const service = new Set<string>();
  for (const id of [...new Set(foreign.map((r) => r.user_id as string))]) {
    try {
      const { data: user } = await admin.auth.admin.getUserById(id);
      if (!user?.user || is_service_account_email(user.user.email) || user.user.is_anonymous === true) {
        service.add(id);
      }
    } catch {
      /* чужой аккаунт не трогаем */
    }
  }
  const take = foreign.filter((r) => r.user_id && service.has(r.user_id)).map((r) => r.id);
  if (take.length) {
    const upd = await admin.from('orders').update({ user_id: into_id }).in('id', take);
    if (!upd.error) moved = true;
  }
  return moved;
}

/**
 * привязать телефон к аккаунту гостя.
 * если номер уже занят техническим профилем (гость точки с кассы / гостевая
 * сессия) — переносим его баллы, заказы и подарки на настоящий аккаунт и
 * удаляем технический. если номер у другого настоящего аккаунта — 409.
 */
function is_vk_auth_user(user: { email?: string | null; user_metadata?: object } | null | undefined) {
  if (!user) return false;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const email = (user.email || '').toLowerCase();
  const vk_id = meta.vk_id;
  const has_vk_id =
    (typeof vk_id === 'number' && vk_id > 0) || (typeof vk_id === 'string' && /^\d+$/.test(vk_id));
  return meta.provider === 'vk' || has_vk_id || /^vk\d+@auth\.yoboba$/.test(email);
}

export async function claim_phone_for_user(input: {
  user_id: string;
  phone: string;
  actor?: string | null;
  /** админ вручную склеивает vk без номера с аккаунтом, где был только телефон */
  allow_phone_account?: boolean;
}): Promise<claim_phone_result> {
  const phone = normalize_phone(input.phone);
  if (!phone) return { ok: false, error: 'укажите корректный номер', status: 400 };
  if (!is_supabase_configured()) {
    return { ok: false, error: 'supabase не настроен', status: 500 };
  }

  const admin = create_service_client();
  const owner = await find_profile_by_phone(admin, phone);

  if (owner && owner.id === input.user_id) {
    const linked_purchases = await pull_cashier_orders(admin, phone, input.user_id);
    return {
      ok: true,
      merged_from: null,
      bonus_balance: owner.bonus_balance ?? null,
      linked_purchases,
    };
  }

  let merged_from: string | null = null;
  let bonus_balance: number | null = null;

  if (owner) {
    let owner_user: Awaited<ReturnType<typeof admin.auth.admin.getUserById>>['data'] | null = null;
    try {
      const looked = await admin.auth.admin.getUserById(owner.id);
      owner_user = looked.data;
    } catch {
      owner_user = null;
    }
    const email = owner_user?.user?.email || null;
    // нет пользователя в auth — профиль кассы осиротел, его можно забрать
    const is_service =
      !owner_user?.user ||
      is_service_account_email(email) ||
      owner_user.user.is_anonymous === true;
    const other_vk = is_vk_auth_user(owner_user?.user);
    let plain_phone = false;
    if (!is_service && input.allow_phone_account && !other_vk) {
      const { data: role_row } = await admin.from('profiles').select('role').eq('id', owner.id).maybeSingle();
      const role = (role_row as { role?: string | null } | null)?.role || 'user';
      plain_phone = role === 'user';
    }
    if (!is_service && !plain_phone) {
      return {
        ok: false,
        error: other_vk
          ? 'этот номер уже на другом аккаунте vk'
          : 'этот номер уже привязан к другому аккаунту',
        status: 409,
      };
    }

    const merged = await merge_profile_into(admin, {
      from_id: owner.id,
      into_id: input.user_id,
      actor: input.actor ?? null,
    });
    if (!merged.ok) return merged;
    merged_from = owner.id;
    bonus_balance = merged.bonus_balance;
  }

  const { error } = await admin
    .from('profiles')
    .update({ phone, updated_at: new Date().toISOString() })
    .eq('id', input.user_id);
  if (error) {
    const duplicate =
      error.code === '23505' ||
      error.message.includes('unique') ||
      error.message.includes('duplicate');
    return {
      ok: false,
      error: duplicate ? 'этот номер уже привязан к другому аккаунту' : error.message,
      status: duplicate ? 409 : 500,
    };
  }

  const linked_purchases =
    Boolean(merged_from) || (await pull_cashier_orders(admin, phone, input.user_id));
  return { ok: true, merged_from, bonus_balance, linked_purchases };
}

/** перенести баллы, заказы и подарки с технического профиля на настоящий */
async function merge_profile_into(
  admin: admin_client,
  input: { from_id: string; into_id: string; actor: string | null }
): Promise<{ ok: true; bonus_balance: number } | { ok: false; error: string; status: number }> {
  const { data: from_row, error: from_err } = await admin
    .from('profiles')
    .select('id, name, phone, bonus_balance')
    .eq('id', input.from_id)
    .maybeSingle();
  if (from_err) return { ok: false, error: from_err.message, status: 500 };
  if (!from_row) return { ok: false, error: 'профиль для слияния не найден', status: 404 };

  const { data: into_row } = await admin
    .from('profiles')
    .select('id, bonus_balance')
    .eq('id', input.into_id)
    .maybeSingle();
  if (!into_row) {
    const ins = await admin.from('profiles').upsert(
      { id: input.into_id, name: 'гость', bonus_balance: 0, role: 'user' },
      { onConflict: 'id' }
    );
    if (ins.error) return { ok: false, error: ins.error.message, status: 500 };
  }

  const carried = Number(from_row.bonus_balance) || 0;

  // сначала освобождаем телефон — иначе update настоящего профиля упрётся в unique
  const free_phone = await admin
    .from('profiles')
    .update({ phone: null, updated_at: new Date().toISOString() })
    .eq('id', input.from_id);
  if (free_phone.error) return { ok: false, error: free_phone.error.message, status: 500 };

  // списываем с технического и начисляем настоящему — обе операции идут в журнал
  let bonus_balance = Number(into_row?.bonus_balance) || 0;
  if (carried > 0) {
    const take = await adjust_bonus_balance(admin, {
      user_id: input.from_id,
      delta: -carried,
      reason: `merge_out:${input.into_id}`,
      actor: input.actor,
    });
    if (!take.ok) return take;
    const give = await adjust_bonus_balance(admin, {
      user_id: input.into_id,
      delta: carried,
      reason: `merge_in:${input.from_id}`,
      actor: input.actor,
    });
    if (!give.ok) {
      // откатываем списание, чтобы баллы не пропали
      await adjust_bonus_balance(admin, {
        user_id: input.from_id,
        delta: carried,
        reason: `merge_rollback:${input.into_id}`,
        actor: input.actor,
      });
      return give;
    }
    bonus_balance = give.bonus_balance;
  }

  // история заказов и подарков едет вместе с гостем; ошибки схемы (нет таблицы) игнорируем
  await admin.from('orders').update({ user_id: input.into_id }).eq('user_id', input.from_id);
  await admin.from('gifts').update({ sender_id: input.into_id }).eq('sender_id', input.from_id);
  await admin
    .from('gifts')
    .update({ recipient_user_id: input.into_id })
    .eq('recipient_user_id', input.from_id);
  await admin
    .from('bonus_transactions')
    .update({ user_id: input.into_id })
    .eq('user_id', input.from_id);
  await admin
    .from('push_subscriptions')
    .update({ user_id: input.into_id })
    .eq('user_id', input.from_id);

  // технический аккаунт больше не нужен; если удалить не вышло — он уже без телефона и с 0 бб
  const { error: del_err } = await admin.auth.admin.deleteUser(input.from_id);
  if (del_err) {
    await admin
      .from('profiles')
      .update({
        name: `${(from_row.name || 'гость').trim()} (объединён)`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.from_id);
  }

  return { ok: true, bonus_balance };
}

/** убедиться, что у телефона есть демо-баланс (для кассы без supabase) */
export async function ensure_demo_bonus_row(input: {
  phone: string;
  name?: string | null;
  seed?: number;
}) {
  const phone = normalize_phone(input.phone);
  if (!phone) return null;
  const existing = await get_demo_bonus(phone);
  if (existing) return existing;
  return upsert_demo_bonus({
    phone,
    name: input.name ?? null,
    bonus_balance: input.seed ?? 0,
  });
}
