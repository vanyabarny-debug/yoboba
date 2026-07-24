import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import {
  get_demo_bonus,
  redeem_demo_bonus,
  upsert_demo_bonus,
} from '@/lib/demo-bonus-server';

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

/** списать тапикоины у гостя (supabase или демо-стор) */
export async function redeem_bonus_points(input: {
  user_id?: string | null;
  phone?: string | null;
  amount?: number;
}): Promise<redeem_result> {
  const amount = Math.max(
    1,
    Math.floor(input.amount ?? FREE_DRINK_BONUS_THRESHOLD)
  );
  const phone = normalize_phone(input.phone);

  if (is_supabase_configured()) {
    const admin = create_service_client();
    let profile: {
      id: string;
      name: string | null;
      phone: string | null;
      bonus_balance: number | null;
    } | null = null;

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
      const { data, error } = await admin
        .from('profiles')
        .select('id, name, phone, bonus_balance')
        .eq('phone', phone)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, status: 500 };
      profile = data;
    }

    if (!profile) {
      return { ok: false, error: 'гость не найден', status: 404 };
    }

    const current = Number(profile.bonus_balance) || 0;
    if (current < amount) {
      return {
        ok: false,
        error: `не хватает тапикоинов: есть ${current}, нужно ${amount}`,
        status: 400,
        bonus_balance: current,
      };
    }

    const next = current - amount;
    const { error: upd_err } = await admin
      .from('profiles')
      .update({ bonus_balance: next, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (upd_err) return { ok: false, error: upd_err.message, status: 500 };

    return {
      ok: true,
      redeemed: amount,
      bonus_balance: next,
      customer: {
        id: profile.id,
        name: profile.name,
        phone: profile.phone,
        bonus_balance: next,
      },
    };
  }

  if (!phone) {
    return {
      ok: false,
      error: 'нужен телефон гостя, чтобы списать тапикоины',
      status: 400,
    };
  }

  let demo = await get_demo_bonus(phone);
  if (!demo) {
    return { ok: false, error: 'гость не найден', status: 404 };
  }

  if (demo.bonus_balance < amount) {
    return {
      ok: false,
      error: `не хватает тапикоинов: есть ${demo.bonus_balance}, нужно ${amount}`,
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
