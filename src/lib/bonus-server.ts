import type { SupabaseClient } from '@supabase/supabase-js';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import {
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

/** технический аккаунт: гость точки с кассы или гостевая сессия сайта */
export function is_service_account_email(email: string | null | undefined) {
  const e = (email || '').toLowerCase();
  return e.endsWith('@yoboba.internal') || e.endsWith('@guest.yoboba.auth');
}

export type claim_phone_result =
  | { ok: true; merged_from: string | null; bonus_balance: number | null }
  | { ok: false; error: string; status: number };

/**
 * привязать телефон к аккаунту гостя.
 * если номер уже занят техническим профилем (гость точки с кассы / гостевая
 * сессия) — переносим его баллы, заказы и подарки на настоящий аккаунт и
 * удаляем технический. если номер у другого настоящего аккаунта — 409.
 */
export async function claim_phone_for_user(input: {
  user_id: string;
  phone: string;
  actor?: string | null;
}): Promise<claim_phone_result> {
  const phone = normalize_phone(input.phone);
  if (!phone) return { ok: false, error: 'укажите корректный номер', status: 400 };
  if (!is_supabase_configured()) {
    return { ok: false, error: 'supabase не настроен', status: 500 };
  }

  const admin = create_service_client();
  const owner = await find_profile_by_phone(admin, phone);

  if (owner && owner.id === input.user_id) {
    return { ok: true, merged_from: null, bonus_balance: owner.bonus_balance ?? null };
  }

  let merged_from: string | null = null;
  let bonus_balance: number | null = null;

  if (owner) {
    const { data: owner_user } = await admin.auth.admin.getUserById(owner.id);
    const email = owner_user?.user?.email || null;
    const is_service =
      is_service_account_email(email) || owner_user?.user?.is_anonymous === true;
    if (!is_service) {
      return {
        ok: false,
        error: 'этот номер уже привязан к другому аккаунту',
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

  return { ok: true, merged_from, bonus_balance };
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
