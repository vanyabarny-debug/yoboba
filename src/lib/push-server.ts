import webpush from 'web-push';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_json_store, write_json_store } from '@/lib/data-store';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_vapid_keys } from '@/lib/vapid';
import { format_phone_display, normalize_phone } from '@/lib/phone';

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
