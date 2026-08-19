import { read_json_store, write_json_store } from '@/lib/data-store';
import { add_demo_order } from '@/lib/demo-orders-server';
import { create_kassa_payment } from '@/lib/kassa';
import { is_pickup_feasible } from '@/lib/kitchen-queue';
import { load_active_orders, load_menu_map } from '@/lib/kitchen-server';
import { allocate_daily_order_number } from '@/lib/order-number';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { gift, order, order_item } from '@/lib/types';

const store_key = 'gifts';
const PAID_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 60 * 60 * 1000;

let write_chain: Promise<unknown> = Promise.resolve();

function with_gifts_lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = write_chain.then(fn, fn);
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function new_gift_id() {
  return `gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function load_gifts(): Promise<gift[]> {
  return read_json_store<gift[]>(store_key, []);
}

async function save_gifts(gifts: gift[]) {
  await write_json_store(store_key, gifts);
}

function expire_gift(row: gift, now = Date.now()): gift {
  if (row.status === 'pending_payment') {
    const created = new Date(row.created_at).getTime();
    if (Number.isFinite(created) && now - created > PENDING_TTL_MS) {
      return { ...row, status: 'cancelled' };
    }
  }
  if (row.status === 'paid' && row.expires_at) {
    const until = new Date(row.expires_at).getTime();
    if (Number.isFinite(until) && until <= now) {
      return { ...row, status: 'cancelled' };
    }
  }
  return row;
}

async function mutate_gifts(fn: (rows: gift[]) => gift[] | Promise<gift[]>): Promise<gift[]> {
  return with_gifts_lock(async () => {
    const now = Date.now();
    const current = (await load_gifts()).map((row) => expire_gift(row, now));
    const next = await fn(current);
    await save_gifts(next);
    return next;
  });
}

export async function list_gifts(): Promise<gift[]> {
  await write_chain.catch(() => undefined);
  const now = Date.now();
  return (await load_gifts()).map((row) => expire_gift(row, now));
}

export async function get_gift_by_id(id: string): Promise<gift | null> {
  const all = await list_gifts();
  return all.find((g) => g.id === id) || null;
}

export async function list_gifts_sent(sender_id: string): Promise<gift[]> {
  return (await list_gifts()).filter((g) => g.sender_id === sender_id);
}

export async function list_gifts_inbox(phone: string): Promise<gift[]> {
  const normalized = normalize_phone(phone);
  if (!normalized) return [];
  return (await list_gifts()).filter(
    (g) => g.recipient_phone === normalized && g.status !== 'pending_payment'
  );
}

export async function list_redeemable_gifts(phone: string): Promise<gift[]> {
  const normalized = normalize_phone(phone);
  if (!normalized) return [];
  return (await list_gifts()).filter(
    (g) => g.recipient_phone === normalized && g.status === 'paid'
  );
}

export type create_gift_input = {
  sender_id: string;
  sender_name: string;
  sender_phone: string | null;
  recipient_phone: string;
  items: order_item[];
  message?: string | null;
};

export async function create_gift(input: create_gift_input): Promise<gift> {
  const recipient_phone = normalize_phone(input.recipient_phone);
  if (!recipient_phone) {
    throw new Error('укажите номер получателя полностью');
  }
  const sender_phone = normalize_phone(input.sender_phone);
  if (sender_phone && sender_phone === recipient_phone) {
    throw new Error('нельзя подарить самому себе');
  }
  const items = (input.items || [])
    .map((row) => ({
      menu_id: String(row.menu_id || ''),
      name: String(row.name || '').trim(),
      price: Math.max(0, Number(row.price) || 0),
      quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
    }))
    .filter((row) => row.menu_id && row.name && row.price > 0);
  if (!items.length) {
    throw new Error('выберите напиток для подарка');
  }

  const total_price = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (total_price <= 0) {
    throw new Error('сумма подарка должна быть больше нуля');
  }

  const draft: gift = {
    id: new_gift_id(),
    sender_id: input.sender_id,
    sender_name: (input.sender_name || '').trim() || 'гость',
    sender_phone,
    recipient_phone,
    recipient_user_id: null,
    items,
    total_price,
    message: (input.message || '').trim().slice(0, 140) || null,
    status: 'pending_payment',
    payment_id: null,
    payment_provider: 'stub',
    checkout_url: null,
    order_id: null,
    created_at: new Date().toISOString(),
    paid_at: null,
    claimed_at: null,
    expires_at: null,
  };

  const checkout = await create_kassa_payment({
    amount: total_price,
    description: `подарок yomoyo · ${items.map((i) => i.name).join(', ')}`,
    gift_id: draft.id,
  });

  const record: gift = {
    ...draft,
    payment_id: checkout.payment_id,
    payment_provider: checkout.provider,
    checkout_url: checkout.checkout_url,
    status: checkout.status === 'paid' ? 'paid' : 'pending_payment',
    paid_at: checkout.status === 'paid' ? new Date().toISOString() : null,
    expires_at:
      checkout.status === 'paid'
        ? new Date(Date.now() + PAID_TTL_MS).toISOString()
        : null,
  };

  await mutate_gifts((rows) => [record, ...rows]);
  return record;
}

export async function mark_gift_paid(id: string, payment_id?: string | null): Promise<gift | null> {
  let found: gift | null = null;
  await mutate_gifts((rows) =>
    rows.map((row) => {
      if (row.id !== id) return row;
      if (row.status === 'paid' || row.status === 'claimed' || row.status === 'redeemed') {
        found = row;
        return row;
      }
      if (row.status !== 'pending_payment') return row;
      if (payment_id && row.payment_id && row.payment_id !== payment_id) return row;
      const next: gift = {
        ...row,
        status: 'paid',
        paid_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + PAID_TTL_MS).toISOString(),
        payment_id: payment_id || row.payment_id,
      };
      found = next;
      return next;
    })
  );
  return found;
}

export async function cancel_gift(id: string, actor_id: string): Promise<gift | null> {
  let found: gift | null = null;
  await mutate_gifts((rows) =>
    rows.map((row) => {
      if (row.id !== id) return row;
      if (row.sender_id !== actor_id) return row;
      if (row.status === 'claimed' || row.status === 'redeemed') return row;
      const next: gift = { ...row, status: 'cancelled' };
      found = next;
      return next;
    })
  );
  return found;
}

async function find_profile_id_by_phone(phone: string): Promise<string | null> {
  if (!is_supabase_configured()) return null;
  const admin = create_service_client();
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  return data?.id || null;
}

async function create_gift_kitchen_order(input: {
  gift: gift;
  pickup_time: string;
  recipient_user_id?: string | null;
}): Promise<order> {
  const { gift, pickup_time } = input;
  const recipient_user_id =
    input.recipient_user_id ||
    (await find_profile_id_by_phone(gift.recipient_phone)) ||
    gift.sender_id;
  const customer_name = `подарок от ${gift.sender_name}`;

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const daily = await allocate_daily_order_number(admin);
    const payload = {
      user_id: recipient_user_id,
      items: gift.items,
      total_price: gift.total_price,
      payment_type: 'online',
      pickup_time,
      status: 'new' as const,
      is_paid: true,
      customer_name,
      customer_phone: gift.recipient_phone,
      order_number: daily.order_number,
      order_day: daily.order_day,
    };
    const { data, error } = await admin.from('orders').insert(payload).select().single();
    if (error || !data) {
      throw new Error(error?.message || 'не удалось поставить подарок в работу');
    }
    return data as order;
  }

  return add_demo_order({
    user_id: recipient_user_id,
    items: gift.items,
    total_price: gift.total_price,
    status: 'new',
    payment_type: 'online',
    is_paid: true,
    customer_name,
    customer_phone: gift.recipient_phone,
    pickup_time,
  });
}

export async function claim_gift(input: {
  gift_id: string;
  actor_phone: string | null;
  actor_id?: string | null;
  pickup_time: string;
  staff?: boolean;
}): Promise<{ gift: gift; order: order }> {
  const gift = await get_gift_by_id(input.gift_id);
  if (!gift) throw new Error('подарок не найден');
  if (gift.status === 'cancelled') throw new Error('этот подарок уже не действует');
  if (gift.status === 'pending_payment') throw new Error('подарок ещё не оплачен');
  if (gift.status === 'claimed' || gift.status === 'redeemed') {
    throw new Error('подарок уже забирают');
  }
  if (gift.status !== 'paid') throw new Error('подарок нельзя забрать');

  const actor_phone = normalize_phone(input.actor_phone);
  if (!input.staff) {
    if (!actor_phone || actor_phone !== gift.recipient_phone) {
      throw new Error('подарок ждёт того, чей номер указан');
    }
  }

  const pickup_at = new Date(input.pickup_time).getTime();
  if (Number.isNaN(pickup_at) || pickup_at <= Date.now()) {
    throw new Error('неверное время выдачи');
  }

  if (!input.staff) {
    const [menu_by_id, active_orders] = await Promise.all([
      load_menu_map(),
      load_active_orders(),
    ]);
    const feasible = is_pickup_feasible({
      active_orders,
      menu_by_id,
      cart_lines: gift.items.map((i) => ({
        menu_id: i.menu_id,
        name: i.name,
        quantity: i.quantity,
      })),
      pickup_at,
    });
    if (!feasible) {
      throw new Error('это время уже занято — выберите другой слот');
    }
  }

  const order = await create_gift_kitchen_order({
    gift,
    pickup_time: input.pickup_time,
    recipient_user_id: input.actor_id || null,
  });

  const next_rows = await mutate_gifts((rows) =>
    rows.map((row) => {
      if (row.id !== gift.id) return row;
      return {
        ...row,
        status: input.staff ? 'redeemed' : 'claimed',
        claimed_at: new Date().toISOString(),
        order_id: order.id,
        recipient_user_id: input.actor_id || row.recipient_user_id,
      };
    })
  );
  const updated = next_rows.find((row) => row.id === gift.id);
  if (!updated) throw new Error('не удалось сохранить подарок');
  return { gift: updated, order };
}

export function public_gift_view(row: gift): gift {
  return row;
}
