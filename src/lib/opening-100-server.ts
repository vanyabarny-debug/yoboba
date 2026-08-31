import { read_json_store, write_json_store } from '@/lib/data-store';
import { add_demo_order } from '@/lib/demo-orders-server';
import { load_menu_map } from '@/lib/kitchen-server';
import { allocate_daily_order_number } from '@/lib/order-number';
import { normalize_phone } from '@/lib/phone';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import type { opening_100_entry, order, order_item } from '@/lib/types';

export const OPENING_100_LIMIT = 100;
const store_key = 'opening-100';

let write_chain: Promise<unknown> = Promise.resolve();

function with_lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = write_chain.then(fn, fn);
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function new_entry_id() {
  return `o100-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function load_entries(): Promise<opening_100_entry[]> {
  return read_json_store<opening_100_entry[]>(store_key, []);
}

async function save_entries(rows: opening_100_entry[]) {
  await write_json_store(store_key, rows);
}

async function mutate_entries(
  fn: (rows: opening_100_entry[]) => opening_100_entry[] | Promise<opening_100_entry[]>
): Promise<opening_100_entry[]> {
  return with_lock(async () => {
    const current = await load_entries();
    const next = await fn(current);
    await save_entries(next);
    return next;
  });
}

export type opening_100_status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
  phone: string | null;
  already_redeemed: boolean;
  entry: opening_100_entry | null;
};

export async function get_opening_100_status(phone?: string | null): Promise<opening_100_status> {
  await write_chain.catch(() => undefined);
  const rows = await load_entries();
  const normalized = phone ? normalize_phone(phone) : null;
  const entry =
    normalized != null
      ? rows.find((row) => row.phone === normalized) || null
      : null;
  const redeemed_count = rows.length;
  const remaining = Math.max(0, OPENING_100_LIMIT - redeemed_count);
  return {
    limit: OPENING_100_LIMIT,
    redeemed_count,
    remaining,
    sold_out: remaining <= 0,
    phone: normalized,
    already_redeemed: Boolean(entry),
    entry,
  };
}

async function find_profile_id_by_phone(phone: string): Promise<string | null> {
  if (!is_supabase_configured()) return null;
  const admin = create_service_client();
  const { data } = await admin
    .from('profiles')
    .select('id, name')
    .eq('phone', phone)
    .maybeSingle();
  return data?.id || null;
}

async function resolve_walk_in_user_id(
  customer_name: string,
  customer_phone: string
): Promise<string> {
  if (is_supabase_configured()) {
    const existing = await find_profile_id_by_phone(customer_phone);
    if (existing) return existing;

    const admin = create_service_client();
    const email = `walkin-${crypto.randomUUID()}@yoboba.internal`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: customer_name, phone: customer_phone },
    });
    if (error || !created.user) {
      throw new Error(error?.message || 'не удалось создать гостя');
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
    return user_id;
  }

  return `demo-${customer_phone.replace(/\D/g, '')}`;
}

async function create_promo_order(input: {
  phone: string;
  customer_name: string;
  items: order_item[];
  pickup_time: string;
}): Promise<order> {
  const user_id = await resolve_walk_in_user_id(input.customer_name, input.phone);

  if (is_supabase_configured()) {
    const admin = create_service_client();
    const daily = await allocate_daily_order_number(admin);
    const payload = {
      user_id,
      items: input.items,
      total_price: 0,
      payment_type: 'online' as const,
      pickup_time: input.pickup_time,
      status: 'new' as const,
      is_paid: true,
      customer_name: input.customer_name,
      customer_phone: input.phone,
      order_number: daily.order_number,
      order_day: daily.order_day,
    };
    const { data, error } = await admin.from('orders').insert(payload).select('*').single();
    if (error || !data) {
      throw new Error(error?.message || 'не удалось поставить напиток в работу');
    }
    return data as order;
  }

  return add_demo_order({
    user_id,
    items: input.items,
    total_price: 0,
    status: 'new',
    payment_type: 'online',
    is_paid: true,
    customer_name: input.customer_name,
    customer_phone: input.phone,
    pickup_time: input.pickup_time,
  });
}

export type redeem_opening_100_input = {
  phone: string;
  items: order_item[];
  pickup_minutes?: number;
  seller_id?: string | null;
  seller_name?: string | null;
  shift_id?: string | null;
  customer_name?: string | null;
};

export async function redeem_opening_100(
  input: redeem_opening_100_input
): Promise<{ entry: opening_100_entry; order: order }> {
  const phone = normalize_phone(input.phone);
  if (!phone) {
    throw new Error('укажите номер телефона полностью');
  }

  const menu = await load_menu_map();
  const items: order_item[] = (input.items || [])
    .map((row) => {
      const m = menu.get(String(row.menu_id || ''));
      return {
        menu_id: String(row.menu_id || ''),
        name: m?.name || String(row.name || '').trim(),
        price: m?.price ?? Math.max(0, Number(row.price) || 0),
        quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
      };
    })
    .filter((row) => row.menu_id && row.name);
  if (!items.length) {
    throw new Error('выберите напиток для выдачи');
  }
  const drink_count = items.reduce((s, i) => s + i.quantity, 0);
  if (drink_count !== 1) {
    throw new Error('по акции — один напиток на номер');
  }

  const minutes = Math.max(5, Math.min(40, Number(input.pickup_minutes) || 10));
  const pickup_time = new Date(Date.now() + minutes * 60_000).toISOString();
  const customer_name = (input.customer_name || '').trim() || 'гость акции';

  let created_entry: opening_100_entry | null = null;
  let created_order: order | null = null;

  await mutate_entries(async (rows) => {
    if (rows.some((row) => row.phone === phone)) {
      throw new Error('этот номер уже получал бесплатный напиток');
    }
    if (rows.length >= OPENING_100_LIMIT) {
      throw new Error('все 100 напитков уже розданы');
    }

    const order = await create_promo_order({
      phone,
      customer_name,
      items,
      pickup_time,
    });
    created_order = order;

    const entry: opening_100_entry = {
      id: new_entry_id(),
      phone,
      items,
      order_id: order.id,
      seller_id: input.seller_id || null,
      seller_name: (input.seller_name || '').trim() || null,
      shift_id: input.shift_id || null,
      created_at: new Date().toISOString(),
    };
    created_entry = entry;
    return [entry, ...rows];
  });

  if (!created_entry || !created_order) {
    throw new Error('не удалось зафиксировать выдачу');
  }

  return { entry: created_entry, order: created_order };
}
