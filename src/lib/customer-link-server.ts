import { resolve_guest_user } from '@/lib/admin-operations-server';
import { earn_bonus_for_paid_order, is_service_account_email } from '@/lib/bonus-server';
import type { stock_actor } from '@/lib/finance/model';
import { record_order_audit } from '@/lib/order-audit-server';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import { format_order_number } from '@/lib/order-number';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { order, order_item } from '@/lib/types';

export type loose_order = {
  id: string;
  created_at: string;
  label: string;
  total_price: number;
  payment_type: order['payment_type'];
  is_paid: boolean;
  title: string;
};

const select =
  'id, user_id, items, total_price, status, payment_type, is_paid, customer_name, customer_phone, created_at, order_number, order_day';

type row = order & { order_number?: number | null; order_day?: string | null };

function items_of(o: row): order_item[] {
  return Array.isArray(o.items) ? o.items : [];
}

function title_of(items: order_item[]) {
  return (
    items
      .map((item) => {
        const n = normalize_order_item_fields({ name: item.name, volume: item.volume });
        const vol = n.volume ? ` ${n.volume}` : '';
        const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
        return `${n.name}${vol}${qty}`;
      })
      .join(', ') || 'покупка'
  );
}

/** id аккаунтов, за которыми не стоит конкретный человек: касса, гостевые сессии */
async function service_users(ids: string[]) {
  const admin = create_service_client();
  const out = new Set<string>();
  const profiles = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await admin.from('profiles').select('id, phone').in('id', ids);
    for (const p of (data as { id: string; phone: string | null }[] | null) ?? []) profiles.set(p.id, p.phone);
  }
  await Promise.all(
    ids.map(async (id) => {
      if (normalize_phone(profiles.get(id) ?? null)) return;
      const { data } = await admin.auth.admin.getUserById(id);
      if (!data?.user || is_service_account_email(data.user.email)) out.add(id);
    })
  );
  return out;
}

/** продажи, которые пробили без гостя: без телефона и на общий аккаунт кассы */
export async function list_loose_orders(days = 30): Promise<loose_order[]> {
  if (!is_supabase_configured()) return [];
  const admin = create_service_client();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('orders')
    .select(select)
    .gte('created_at', since)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const rows = ((data as row[] | null) ?? []).filter(
    (o) => !normalize_phone(o.customer_phone) && !items_of(o).some((i) => i.kind === 'staff')
  );
  const user_ids = [...new Set(rows.map((o) => o.user_id).filter((id): id is string => Boolean(id)))];
  const service = await service_users(user_ids);
  return rows
    .filter((o) => !o.user_id || service.has(o.user_id))
    .map((o) => ({
      id: o.id,
      created_at: o.created_at,
      label: `№${format_order_number(o)}`,
      total_price: Number(o.total_price) || 0,
      payment_type: o.payment_type,
      is_paid: o.is_paid !== false,
      title: title_of(items_of(o)),
    }));
}

export type assign_result =
  | { ok: true; user_id: string; earned: number; bonus_balance: number | null; bonus_note: string | null }
  | { ok: false; error: string; status: number };

const skip_note: Record<string, string> = {
  unpaid: 'заказ не оплачен — бобаллы не начислены',
  bonus_payment: 'оплачен бобаллами — начислять нечего',
  already: 'бобаллы за этот заказ уже начисляли',
  zero: 'за эти позиции бобаллы не положены',
  no_guest: 'не нашли профиль гостя',
  failed: 'не удалось начислить бобаллы',
};

/** привязать продажу без гостя к клиенту и (по желанию) начислить бобаллы, как на кассе */
export async function assign_order_to_customer(input: {
  order_id: string;
  customer_id: string;
  phone: string | null;
  name: string | null;
  earn: boolean;
  actor: stock_actor;
}): Promise<assign_result> {
  if (!is_supabase_configured()) return { ok: false, error: 'supabase не настроен', status: 500 };
  const admin = create_service_client();

  const { data: found, error: read_err } = await admin.from('orders').select(select).eq('id', input.order_id).maybeSingle();
  if (read_err) return { ok: false, error: read_err.message, status: 500 };
  const o = found as row | null;
  if (!o) return { ok: false, error: 'покупка не найдена', status: 404 };
  if (o.status === 'cancelled') return { ok: false, error: 'покупка отменена', status: 400 };
  if (normalize_phone(o.customer_phone)) {
    return { ok: false, error: 'у этой покупки уже есть гость', status: 409 };
  }
  if (o.user_id && !(await service_users([o.user_id])).has(o.user_id)) {
    return { ok: false, error: 'у этой покупки уже есть гость', status: 409 };
  }

  let user_id = input.customer_id;
  const phone = normalize_phone(input.phone);
  if (!/^[0-9a-f-]{36}$/i.test(user_id)) {
    if (!phone) return { ok: false, error: 'у гостя нет телефона — не к чему привязать', status: 400 };
    try {
      user_id = await resolve_guest_user((input.name || '').trim() || 'гость', phone);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'не удалось создать гостя', status: 500 };
    }
  }

  const { data: profile } = await admin.from('profiles').select('id, name, phone').eq('id', user_id).maybeSingle();
  const p = profile as { id: string; name: string | null; phone: string | null } | null;
  if (!p) return { ok: false, error: 'гость не найден', status: 404 };
  const customer_phone = normalize_phone(p.phone) || phone;
  const customer_name = (p.name || input.name || '').trim() || o.customer_name || 'гость';

  const { error: upd_err } = await admin
    .from('orders')
    .update({ user_id, customer_phone, customer_name })
    .eq('id', o.id);
  if (upd_err) return { ok: false, error: upd_err.message, status: 500 };

  let earned = 0;
  let bonus_balance: number | null = null;
  let bonus_note: string | null = null;
  if (input.earn) {
    const res = await earn_bonus_for_paid_order({
      order_id: o.id,
      user_id,
      customer_phone,
      customer_name,
      items: items_of(o).map((i) => ({ menu_id: i.menu_id, quantity: i.quantity, kind: i.kind ?? null })),
      payment_type: o.payment_type,
      is_paid: o.is_paid !== false,
      actor: input.actor.name,
    });
    earned = res.earned;
    bonus_balance = res.bonus_balance;
    bonus_note = res.skipped ? skip_note[res.skipped] || null : null;
  }

  await record_order_audit({
    action: 'update',
    actor_id: input.actor.id,
    actor_name: input.actor.name,
    order_id: o.id,
    order_label: `№${format_order_number(o)}`,
    before: 'без гостя',
    after: `гость: ${customer_name}${customer_phone ? ` ${customer_phone}` : ''}${earned ? ` · +${earned} бобаллов` : ''}`,
    before_total: Number(o.total_price) || 0,
    after_total: Number(o.total_price) || 0,
  });

  return { ok: true, user_id, earned, bonus_balance, bonus_note };
}
