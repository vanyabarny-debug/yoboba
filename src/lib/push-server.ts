import webpush from 'web-push';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_json_store, write_json_store } from '@/lib/data-store';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_vapid_keys } from '@/lib/vapid';
import { format_phone_display, normalize_phone } from '@/lib/phone';
import { guest_level, type guest_rank_order } from '@/lib/guest-rank';
import { PUSH_CATEGORIES, parse_push_categories, type push_category_id } from '@/lib/push-categories';
import { seller_id_cookie } from '@/lib/session';
import { get_sellers } from '@/lib/sellers-server';
import { parse_seller_access } from '@/lib/seller-access';

const store_key = 'push-subscriptions';

export type push_subscription_row = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type push_target = {
  key: string;
  user_id: string | null;
  subscription_ids: string[];
  name: string;
  phone: string | null;
  devices: number;
};

export type push_payload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let write_chain: Promise<unknown> = Promise.resolve();

function with_lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = write_chain.then(fn, fn);
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function is_admin_request() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

async function load_file_subs(): Promise<push_subscription_row[]> {
  return read_json_store<push_subscription_row[]>(store_key, []);
}

async function save_file_subs(rows: push_subscription_row[]) {
  await write_json_store(store_key, rows);
}

export async function upsert_push_subscription(input: {
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  if (is_supabase_configured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = create_service_client();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: input.user_id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw new Error(error.message);
    return;
  }

  await with_lock(async () => {
    const rows = await load_file_subs();
    const idx = rows.findIndex((r) => r.endpoint === input.endpoint);
    const row: push_subscription_row = {
      id: idx >= 0 ? rows[idx].id : `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user_id: input.user_id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      created_at: idx >= 0 ? rows[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) rows[idx] = row;
    else rows.unshift(row);
    await save_file_subs(rows);
  });
}

async function load_all_subscriptions(): Promise<push_subscription_row[]> {
  if (is_supabase_configured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = create_service_client();
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, created_at');
    if (error) throw new Error(error.message);
    return (data as push_subscription_row[]) || [];
  }
  return load_file_subs();
}

async function delete_subscription(id: string, endpoint: string) {
  if (is_supabase_configured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = create_service_client();
    await supabase.from('push_subscriptions').delete().eq('id', id);
    return;
  }
  await with_lock(async () => {
    const rows = await load_file_subs();
    await save_file_subs(rows.filter((r) => r.id !== id && r.endpoint !== endpoint));
  });
}

export async function list_push_targets(): Promise<{
  configured: boolean;
  total_devices: number;
  targets: push_target[];
}> {
  const keys = await get_vapid_keys();
  const subs = await load_all_subscriptions();
  const by_user = new Map<string, push_subscription_row[]>();
  for (const sub of subs) {
    const key = sub.user_id || `device:${sub.id}`;
    const list = by_user.get(key) || [];
    list.push(sub);
    by_user.set(key, list);
  }

  const profile_ids = [...by_user.keys()].filter((id) => !id.startsWith('device:'));
  const profiles = new Map<string, { name: string | null; phone: string | null }>();
  if (profile_ids.length && is_supabase_configured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = create_service_client();
    const { data } = await supabase
      .from('profiles')
      .select('id, name, phone')
      .in('id', profile_ids);
    for (const row of data || []) {
      profiles.set(row.id, { name: row.name, phone: row.phone });
    }
  }

  const targets: push_target[] = [...by_user.entries()].map(([key, list]) => {
    const profile = profiles.get(key);
    const phone = normalize_phone(profile?.phone) || null;
    return {
      key,
      user_id: key.startsWith('device:') ? null : key,
      subscription_ids: list.map((s) => s.id),
      name: (profile?.name || '').trim() || (key.startsWith('device:') ? 'гость · устройство' : 'гость'),
      phone: phone ? format_phone_display(phone) : null,
      devices: list.length,
    };
  });

  targets.sort((a, b) => {
    if (Boolean(a.user_id) !== Boolean(b.user_id)) return a.user_id ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  return {
    configured: Boolean(keys.publicKey && keys.privateKey),
    total_devices: subs.length,
    targets,
  };
}

export async function send_web_push(input: {
  payload: push_payload;
  audience: 'all' | 'selected';
  keys?: string[];
}): Promise<{ sent: number; failed: number; total: number }> {
  const vapid = await get_vapid_keys();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subs = await load_all_subscriptions();
  const selected = new Set(input.keys || []);
  const picked =
    input.audience === 'all'
      ? subs
      : subs.filter((s) => {
          const user_key = s.user_id || `device:${s.id}`;
          return selected.has(user_key) || selected.has(s.id);
        });

  const json = JSON.stringify({
    title: input.payload.title,
    body: input.payload.body,
    tag: input.payload.tag || `yoboba-broadcast-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: { url: input.payload.url || '/' },
  });

  let sent = 0;
  let failed = 0;
  for (const sub of picked) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        json
      );
      sent += 1;
    } catch {
      failed += 1;
      await delete_subscription(sub.id, sub.endpoint);
    }
  }

  return { sent, failed, total: picked.length };
}

export async function send_push_to_user_id(user_id: string, payload: Record<string, unknown>) {
  const vapid = await get_vapid_keys();
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const subs = (await load_all_subscriptions()).filter((s) => s.user_id === user_id);
  const json = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        json
      );
    } catch {
      await delete_subscription(sub.id, sub.endpoint);
    }
  }
}

/** админ — все категории. сотрудник — только отмеченные в карточке. иначе нет права */
export async function caller_push_categories(): Promise<push_category_id[] | null> {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role === 'admin') return PUSH_CATEGORIES.map((row) => row.id);
  if (role !== 'seller') return null;
  const id = store.get(seller_id_cookie)?.value;
  if (!id) return null;
  const sellers = await get_sellers();
  const seller = sellers.find((row) => row.id === id && row.is_active);
  if (!seller || !parse_seller_access(seller.access).push) return null;
  const picked = parse_push_categories(seller.push_categories);
  return picked.length ? picked : null;
}

function category_ids_of(level: ReturnType<typeof guest_level>): push_category_id[] {
  const ids: push_category_id[] = [];
  if (level.kind === 'new' || level.kind === 'second' || level.kind === 'sometimes' || level.kind === 'regular' || level.kind === 'legend') {
    ids.push(level.kind);
  }
  if (level.cooling) ids.push('cooling');
  if (level.fresh === 'hot') ids.push('fresh_hot');
  if (level.fresh === 'nudge') ids.push('fresh_nudge');
  if (level.fresh === 'gone') ids.push('fresh_gone');
  return ids;
}

type guest_bucket = { people: Set<string>; devices: number; keys: string[] };

async function buckets_by_category(): Promise<{
  buckets: Map<push_category_id, guest_bucket>;
  devices_of: Map<string, number>;
}> {
  const buckets = new Map<push_category_id, guest_bucket>();
  const devices_of = new Map<string, number>();
  for (const row of PUSH_CATEGORIES) buckets.set(row.id, { people: new Set(), devices: 0, keys: [] });

  const subs = await load_all_subscriptions();
  const by_user = new Map<string, push_subscription_row[]>();
  for (const sub of subs) {
    if (!sub.user_id) continue;
    const list = by_user.get(sub.user_id) || [];
    list.push(sub);
    by_user.set(sub.user_id, list);
  }
  const user_ids = [...by_user.keys()];
  if (!user_ids.length || !is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { buckets, devices_of };
  }

  const supabase = create_service_client();
  const phones = new Map<string, string>();
  for (let i = 0; i < user_ids.length; i += 80) {
    const chunk = user_ids.slice(i, i + 80);
    const { data } = await supabase.from('profiles').select('id, phone').in('id', chunk);
    for (const row of data || []) {
      const phone = normalize_phone((row as { phone?: string | null }).phone);
      if (phone && row.id) phones.set(row.id as string, phone.replace(/\D/g, '').slice(-10));
    }
  }

  const orders_by_user = new Map<string, (guest_rank_order & { id: string })[]>();
  const orders_by_phone = new Map<string, (guest_rank_order & { id: string })[]>();
  for (let from = 0; from < 8000; from += 500) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, user_id, customer_phone, items, status, created_at')
      .neq('status', 'cancelled')
      .range(from, from + 499);
    if (error || !data?.length) break;
    for (const row of data as {
      id: string;
      user_id?: string | null;
      customer_phone?: string | null;
      items?: guest_rank_order['items'];
      status: string;
      created_at: string;
    }[]) {
      const order = {
        id: row.id,
        created_at: row.created_at,
        status: row.status,
        items: row.items || [],
      };
      if (row.user_id) {
        const list = orders_by_user.get(row.user_id) || [];
        list.push(order);
        orders_by_user.set(row.user_id, list);
      }
      const digits = (row.customer_phone || '').replace(/\D/g, '');
      if (digits.length >= 10) {
        const key = digits.slice(-10);
        const list = orders_by_phone.get(key) || [];
        list.push(order);
        orders_by_phone.set(key, list);
      }
    }
    if (data.length < 500) break;
  }

  for (const [user_id, list] of by_user) {
    const seen = new Set<string>();
    const orders: guest_rank_order[] = [];
    const phone = phones.get(user_id);
    for (const order of [...(orders_by_user.get(user_id) || []), ...(phone ? orders_by_phone.get(phone) || [] : [])]) {
      if (seen.has(order.id)) continue;
      seen.add(order.id);
      orders.push(order);
    }
    const level = guest_level(orders);
    for (const id of category_ids_of(level)) {
      const bucket = buckets.get(id);
      if (!bucket) continue;
      bucket.people.add(user_id);
      bucket.devices += list.length;
      bucket.keys.push(user_id);
    }
    devices_of.set(user_id, list.length);
  }
  return { buckets, devices_of };
}

export async function push_category_counts(allowed: push_category_id[]) {
  const { buckets } = await buckets_by_category();
  return PUSH_CATEGORIES.filter((row) => allowed.includes(row.id)).map((row) => {
    const bucket = buckets.get(row.id);
    return {
      id: row.id,
      label: row.label,
      hint: row.hint,
      people: bucket?.people.size ?? 0,
      devices: bucket?.devices ?? 0,
    };
  });
}

export async function push_keys_for_categories(
  ids: push_category_id[]
): Promise<{ keys: string[]; people: number; devices: number }> {
  const { buckets, devices_of } = await buckets_by_category();
  const keys = new Set<string>();
  for (const id of ids) {
    for (const key of buckets.get(id)?.keys || []) keys.add(key);
  }
  let devices = 0;
  for (const key of keys) devices += devices_of.get(key) || 0;
  return { keys: [...keys], people: keys.size, devices };
}
