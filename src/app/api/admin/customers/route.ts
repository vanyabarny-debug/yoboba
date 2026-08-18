import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { normalize_phone } from '@/lib/phone';
import type { order, order_item } from '@/lib/types';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

type profile_row = {
  id: string;
  name: string | null;
  phone: string | null;
  role: string | null;
  bonus_balance: number | null;
  created_at: string | null;
  avatar_emoji: string | null;
};

type customer_order = {
  id: string;
  created_at: string;
  status: order['status'];
  total_price: number;
  payment_type: order['payment_type'];
  items: { name: string; quantity: number; price: number }[];
};

type customer_row = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  via: 'vk' | 'телефон' | 'vk и телефон';
  bonus_balance: number;
  created_at: string | null;
  avatar_emoji: string | null;
  avatar_url: string | null;
  vk_url: string | null;
  orders_count: number;
  spent: number;
  last_order_at: string | null;
  top_items: { name: string; quantity: number }[];
  orders: customer_order[];
};

type auth_info = {
  is_vk: boolean;
  phone: string | null;
  avatar_url: string | null;
  name: string | null;
  vk_url: string | null;
};

function missing_column_from_error(message: string) {
  const match = message.match(/column \w+\.([a-z0-9_]+) does not exist/i);
  return match?.[1] ?? null;
}

async function fetch_all_rows<T>(
  table: 'profiles' | 'orders',
  columns: string
): Promise<T[]> {
  const supabase = create_service_client();
  const page = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) {
      const missing = missing_column_from_error(error.message);
      if (missing) {
        const next = columns
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part && part !== missing)
          .join(', ');
        if (next && next !== columns) {
          return fetch_all_rows<T>(table, next);
        }
      }
      throw new Error(error.message);
    }
    const chunk = (data as T[]) || [];
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return rows;
}

function order_items(raw: order['items'] | null | undefined): order_item[] {
  return Array.isArray(raw) ? raw : [];
}

function to_customer_order(o: order): customer_order {
  return {
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    total_price: Number(o.total_price) || 0,
    payment_type: o.payment_type,
    items: order_items(o.items).map((item) => ({
      name: item.name,
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
    })),
  };
}

function empty_customer(input: {
  id: string;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  via?: customer_row['via'];
  bonus_balance?: number | null;
  created_at?: string | null;
  avatar_emoji?: string | null;
  avatar_url?: string | null;
  vk_url?: string | null;
}): customer_row {
  return {
    id: input.id,
    name: (input.name || '').trim() || 'гость',
    phone: normalize_phone(input.phone) || input.phone || null,
    role: input.role || 'user',
    via: input.via || 'телефон',
    bonus_balance: Number(input.bonus_balance) || 0,
    created_at: input.created_at || null,
    avatar_emoji: input.avatar_emoji || null,
    avatar_url: input.avatar_url?.trim() || null,
    vk_url: input.vk_url?.trim() || null,
    orders_count: 0,
    spent: 0,
    last_order_at: null,
    top_items: [],
    orders: [],
  };
}

function via_label(has_vk: boolean, phone: string | null): customer_row['via'] {
  if (has_vk && phone) return 'vk и телефон';
  if (has_vk) return 'vk';
  return 'телефон';
}

function is_identified(phone: string | null, auth?: auth_info) {
  if (normalize_phone(phone) || auth?.phone) return true;
  return Boolean(auth?.is_vk);
}

function name_from_meta(meta: Record<string, unknown>) {
  const full = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full;
  const parts = [meta.first_name, meta.last_name]
    .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
    .map((v) => v.trim());
  return parts.length ? parts.join(' ') : null;
}

function phone_from_auth(user_phone: string | undefined | null, meta: Record<string, unknown>) {
  const candidates = [
    user_phone,
    meta.phone,
    meta.verified_phone,
    meta.phone_number,
  ];
  for (const raw of candidates) {
    const phone = normalize_phone(typeof raw === 'string' ? raw : null);
    if (phone) return phone;
  }
  return null;
}

function avatar_from_meta(meta: Record<string, unknown>) {
  const raw = typeof meta.avatar_url === 'string' ? meta.avatar_url.trim() : '';
  return raw || null;
}

function vk_id_from_auth(meta: Record<string, unknown>, email: string) {
  const raw = meta.vk_id;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return String(Math.trunc(raw));
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return raw.trim();
  const from_email = email.match(/^vk(\d+)@auth\.yoboba$/);
  return from_email?.[1] || null;
}

function vk_profile_url(vk_id: string | null) {
  return vk_id ? `https://vk.ru/id${vk_id}` : null;
}

async function fetch_auth_info() {
  const admin = create_service_client();
  const map = new Map<string, auth_info>();
  const per_page = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: per_page });
    if (error) throw error;
    const users = data.users || [];
    for (const user of users) {
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const email = (user.email || '').toLowerCase();
      const is_vk =
        meta.provider === 'vk' ||
        Boolean(meta.vk_id) ||
        (email.startsWith('vk') && email.endsWith('@auth.yoboba'));
      const phone = phone_from_auth(user.phone, meta);
      const vk_id = vk_id_from_auth(meta, email);
      map.set(user.id, {
        is_vk: is_vk || Boolean(vk_id),
        phone,
        avatar_url: avatar_from_meta(meta),
        name: name_from_meta(meta),
        vk_url: vk_profile_url(vk_id),
      });
    }
    if (users.length < per_page) break;
  }
  return map;
}

function merge_auth(customer: customer_row, auth?: auth_info) {
  if (!auth) return;
  const phone = normalize_phone(customer.phone) || auth.phone;
  if (phone) customer.phone = phone;
  if (!customer.avatar_url && auth.avatar_url) customer.avatar_url = auth.avatar_url;
  if (!customer.vk_url && auth.vk_url) customer.vk_url = auth.vk_url;
  const auth_name = (auth.name || '').trim();
  if ((customer.name === 'гость' || !customer.name.trim()) && auth_name) {
    customer.name = auth_name;
  }
  customer.via = via_label(auth.is_vk, customer.phone);
}

function attach_order(customer: customer_row, o: order) {
  customer.orders.push(to_customer_order(o));
  if (!customer.last_order_at || o.created_at > customer.last_order_at) {
    customer.last_order_at = o.created_at;
  }
  if ((o.customer_name || '').trim() && customer.name === 'гость') {
    customer.name = (o.customer_name || '').trim();
  }
  if (!customer.phone) {
    customer.phone = normalize_phone(o.customer_phone) || o.customer_phone || null;
  }
  if (o.status === 'cancelled') return;
  customer.orders_count += 1;
  customer.spent += Number(o.total_price) || 0;
}

function finalize(customer: customer_row) {
  customer.orders.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const qty = new Map<string, number>();
  for (const o of customer.orders) {
    if (o.status === 'cancelled') continue;
    for (const item of o.items) {
      qty.set(item.name, (qty.get(item.name) || 0) + item.quantity);
    }
  }
  customer.top_items = [...qty.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  customer.spent = Math.round(customer.spent);
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const by_id = new Map<string, customer_row>();
  const by_phone = new Map<string, customer_row>();

  function remember(row: customer_row) {
    by_id.set(row.id, row);
    const phone = normalize_phone(row.phone);
    if (phone) by_phone.set(phone, row);
  }

  let auth_by_id = new Map<string, auth_info>();
  try {
    if (is_supabase_configured()) {
      auth_by_id = await fetch_auth_info();
      let profiles: profile_row[] = [];
      try {
        profiles = await fetch_all_rows<profile_row>(
          'profiles',
          'id, name, phone, role, bonus_balance, created_at, avatar_emoji'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('does not exist')) throw err;
        profiles = await fetch_all_rows<profile_row>(
          'profiles',
          'id, name, phone, role, bonus_balance'
        );
      }
      for (const p of profiles) {
        const auth = auth_by_id.get(p.id);
        const phone = normalize_phone(p.phone) || auth?.phone || null;
        if (!is_identified(phone, auth)) continue;
        remember(
          empty_customer({
            id: p.id,
            name: p.name || auth?.name,
            phone,
            role: p.role,
            via: via_label(Boolean(auth?.is_vk), phone),
            bonus_balance: p.bonus_balance,
            created_at: p.created_at,
            avatar_emoji: p.avatar_emoji,
            avatar_url: auth?.avatar_url,
            vk_url: auth?.vk_url,
          })
        );
      }

      for (const [id, auth] of auth_by_id) {
        if (by_id.has(id)) continue;
        if (!is_identified(auth.phone, auth)) continue;
        remember(
          empty_customer({
            id,
            name: auth.name,
            phone: auth.phone,
            via: via_label(auth.is_vk, auth.phone),
            avatar_url: auth.avatar_url,
            vk_url: auth.vk_url,
          })
        );
      }
    }
  } catch (err) {
    console.error('admin customers profiles', err);
    return NextResponse.json(
      { error: 'не удалось загрузить клиентов' },
      { status: 500 }
    );
  }

  const orders: order[] = [];
  const seen = new Set<string>();

  if (is_supabase_configured()) {
    try {
      const rows = await fetch_all_rows<order>(
        'orders',
        'id, user_id, items, total_price, status, payment_type, created_at'
      );
      for (const o of rows) {
        if (!o?.id || seen.has(o.id)) continue;
        seen.add(o.id);
        orders.push(o);
      }
    } catch (err) {
      console.error('admin customers orders', err);
      return NextResponse.json(
        { error: 'не удалось загрузить заказы' },
        { status: 500 }
      );
    }
  }

  for (const o of await get_demo_orders(false)) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    orders.push(o);
  }

  for (const o of orders) {
    const phone = normalize_phone(o.customer_phone);
    const existing =
      (o.user_id && by_id.get(o.user_id)) || (phone ? by_phone.get(phone) : undefined);

    if (existing) {
      attach_order(existing, o);
      continue;
    }

    if (!phone) continue;

    const guest = empty_customer({
      id: o.user_id || `guest:${phone}`,
      name: o.customer_name,
      phone,
      role: 'user',
      via: 'телефон',
    });
    attach_order(guest, o);
    remember(guest);
  }

  const customers = [...by_id.values()].filter((c) =>
    is_identified(c.phone, auth_by_id.get(c.id))
  );
  for (const c of customers) {
    merge_auth(c, auth_by_id.get(c.id));
    finalize(c);
  }
  customers.sort((a, b) => {
    if (a.last_order_at && b.last_order_at) return a.last_order_at < b.last_order_at ? 1 : -1;
    if (a.last_order_at) return -1;
    if (b.last_order_at) return 1;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  return NextResponse.json({
    customers,
    totals: {
      users: customers.length,
      with_orders: customers.filter((c) => c.orders.length > 0).length,
      orders: customers.reduce((n, c) => n + c.orders.length, 0),
      spent: customers.reduce((n, c) => n + c.spent, 0),
    },
  });
}
