import type { SupabaseClient } from '@supabase/supabase-js';
import { read_json_store, write_json_store } from '@/lib/data-store';
import { is_supabase_configured } from '@/lib/supabase/config';
import { mark_table_present, note_table_error, table_is_missing } from '@/lib/supabase/schema-cache';
import { create_service_client } from '@/lib/supabase/service';

const store_key = 'app-inbox';
const max_messages = 160;
const max_image = 180_000;
const month_ms = 30 * 24 * 60 * 60 * 1000;
const list_limit = 300;
const prune_every_ms = 6 * 60 * 60 * 1000;

export type inbox_source = 'inbox' | 'push';

export type inbox_message = {
  id: string;
  title: string;
  body: string;
  emoji: string | null;
  image: string | null;
  href: string | null;
  source: inbox_source;
  created_at: string;
  user_ids: string[];
  read_by: string[];
};

export type inbox_item = {
  id: string;
  title: string;
  body: string;
  emoji: string | null;
  image: string | null;
  href: string | null;
  source: inbox_source;
  created_at: string;
  unread: boolean;
};

type receipt_row = {
  read_at: string | null;
  inbox_messages: {
    id: string;
    title: string;
    body: string;
    emoji: string | null;
    image: string | null;
    href: string | null;
    source: inbox_source;
    created_at: string;
  } | null;
};

let write_chain: Promise<unknown> = Promise.resolve();
let pruned_at = 0;
let import_once: Promise<void> | null = null;

function with_lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = write_chain.then(fn, fn);
  write_chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function is_user_id(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export function safe_inbox_href(raw: string | null | undefined) {
  const url = (raw || '').trim();
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url.slice(0, 240);
  return null;
}

function clean_emoji(raw: string | null | undefined) {
  const emoji = (raw || '').trim();
  if (!emoji) return null;
  return [...emoji].slice(0, 4).join('').slice(0, 16);
}

function clean_image(raw: string | null | undefined) {
  const image = (raw || '').trim();
  if (!image) return null;
  if (!/^data:image\/(jpeg|png|webp);base64,/i.test(image)) return null;
  if (image.length > max_image) return null;
  return image;
}

function chunks<T>(rows: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function missing_table(message: string | undefined) {
  return (
    note_table_error('inbox_messages', message) || note_table_error('inbox_receipts', message)
  );
}

function use_cloud() {
  return is_supabase_configured() && !table_is_missing('inbox_messages') && !table_is_missing('inbox_receipts');
}

async function load_legacy(): Promise<inbox_message[]> {
  const rows = await read_json_store<inbox_message[]>(store_key, []);
  return Array.isArray(rows) ? rows : [];
}

async function save_legacy(rows: inbox_message[]) {
  await write_json_store(store_key, rows.slice(0, max_messages));
}

async function list_legacy(user_id: string): Promise<{ items: inbox_item[]; unread: number }> {
  const since = Date.now() - month_ms;
  const rows = await load_legacy();
  const items = rows
    .filter((row) => row.user_ids.includes(user_id) && Date.parse(row.created_at) >= since)
    .slice(0, list_limit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      emoji: row.emoji,
      image: row.image,
      href: row.href,
      source: row.source,
      created_at: row.created_at,
      unread: !row.read_by.includes(user_id),
    }));
  return { items, unread: items.filter((row) => row.unread).length };
}

async function record_legacy(message: inbox_message): Promise<{ id: string; recipients: number }> {
  await with_lock(async () => {
    const rows = await load_legacy();
    rows.unshift(message);
    await save_legacy(rows);
  });
  return { id: message.id, recipients: message.user_ids.length };
}

async function mark_legacy(user_id: string, ids: string[]) {
  const want = new Set(ids);
  await with_lock(async () => {
    const rows = await load_legacy();
    let changed = false;
    for (const row of rows) {
      if (!want.has(row.id) || !row.user_ids.includes(user_id) || row.read_by.includes(user_id)) {
        continue;
      }
      row.read_by.push(user_id);
      changed = true;
    }
    if (changed) await save_legacy(rows);
  });
}

async function prune(admin: SupabaseClient) {
  if (Date.now() - pruned_at < prune_every_ms) return;
  pruned_at = Date.now();
  const cutoff = new Date(Date.now() - month_ms).toISOString();
  const { error } = await admin.from('inbox_messages').delete().lt('created_at', cutoff);
  if (error && missing_table(error.message)) pruned_at = 0;
}

async function import_legacy(admin: SupabaseClient) {
  const rows = await load_legacy();
  const since = Date.now() - month_ms;
  for (const row of rows) {
    if (!row?.id || Date.parse(row.created_at) < since) continue;
    const user_ids = [...new Set((row.user_ids || []).filter(is_user_id))];
    if (!user_ids.length) continue;
    const { error } = await admin.from('inbox_messages').upsert(
      {
        id: row.id,
        title: row.title,
        body: row.body,
        emoji: row.emoji,
        image: row.image,
        href: row.href,
        source: row.source === 'push' ? 'push' : 'inbox',
        created_at: row.created_at,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) {
      if (missing_table(error.message)) throw error;
      continue;
    }
    const read = new Set(row.read_by || []);
    const receipts = user_ids.map((user_id) => ({
      message_id: row.id,
      user_id,
      created_at: row.created_at,
      read_at: read.has(user_id) ? row.created_at : null,
    }));
    for (const part of chunks(receipts, 400)) {
      const { error: receipt_error } = await admin
        .from('inbox_receipts')
        .upsert(part, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
      if (receipt_error && missing_table(receipt_error.message)) throw receipt_error;
    }
  }
}

function ensure_imported(admin: SupabaseClient) {
  if (!import_once) {
    import_once = import_legacy(admin).catch((error: unknown) => {
      import_once = null;
      throw error;
    });
  }
  return import_once;
}

function to_items(rows: receipt_row[]): inbox_item[] {
  const items: inbox_item[] = [];
  for (const row of rows) {
    const message = row.inbox_messages;
    if (!message) continue;
    items.push({
      id: message.id,
      title: message.title,
      body: message.body,
      emoji: message.emoji,
      image: message.image,
      href: message.href,
      source: message.source,
      created_at: message.created_at,
      unread: !row.read_at,
    });
  }
  return items;
}

export async function record_inbox(input: {
  title: string;
  body: string;
  emoji?: string | null;
  image?: string | null;
  href?: string | null;
  source: inbox_source;
  user_ids: string[];
}): Promise<{ id: string; recipients: number } | null> {
  const title = input.title.trim().slice(0, 80);
  const body = input.body.trim().slice(0, 600);
  const user_ids = [...new Set(input.user_ids.map((id) => id.trim()).filter(is_user_id))];
  if (!title || !body || !user_ids.length) return null;

  const message: inbox_message = {
    id: `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    emoji: clean_emoji(input.emoji),
    image: input.source === 'inbox' ? clean_image(input.image) : null,
    href: safe_inbox_href(input.href),
    source: input.source,
    created_at: new Date().toISOString(),
    user_ids,
    read_by: [],
  };

  if (!use_cloud()) return record_legacy(message);

  const admin = create_service_client();
  await prune(admin);
  const { error } = await admin.from('inbox_messages').insert({
    id: message.id,
    title: message.title,
    body: message.body,
    emoji: message.emoji,
    image: message.image,
    href: message.href,
    source: message.source,
    created_at: message.created_at,
  });
  if (error) {
    if (missing_table(error.message)) return record_legacy(message);
    return null;
  }

  let recipients = 0;
  const receipts = user_ids.map((user_id) => ({
    message_id: message.id,
    user_id,
    created_at: message.created_at,
    read_at: null,
  }));
  for (const part of chunks(receipts, 400)) {
    const { error: receipt_error } = await admin.from('inbox_receipts').insert(part);
    if (receipt_error) {
      if (missing_table(receipt_error.message)) break;
      continue;
    }
    recipients += part.length;
  }
  if (!recipients) {
    await admin.from('inbox_messages').delete().eq('id', message.id);
    return record_legacy(message);
  }

  mark_table_present('inbox_messages');
  mark_table_present('inbox_receipts');
  void ensure_imported(admin).catch(() => undefined);
  return { id: message.id, recipients };
}

export async function list_inbox(user_id: string): Promise<{ items: inbox_item[]; unread: number }> {
  if (!is_user_id(user_id)) return { items: [], unread: 0 };
  if (!use_cloud()) return list_legacy(user_id);

  const admin = create_service_client();
  try {
    await ensure_imported(admin);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (missing_table(message) || table_is_missing('inbox_messages')) return list_legacy(user_id);
  }
  void prune(admin);

  const since = new Date(Date.now() - month_ms).toISOString();
  const { data, error } = await admin
    .from('inbox_receipts')
    .select('read_at, inbox_messages!inner(id, title, body, emoji, image, href, source, created_at)')
    .eq('user_id', user_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(list_limit);

  if (error) {
    if (missing_table(error.message)) return list_legacy(user_id);
    return { items: [], unread: 0 };
  }

  mark_table_present('inbox_messages');
  mark_table_present('inbox_receipts');
  const items = to_items((data ?? []) as unknown as receipt_row[]);
  return { items, unread: items.filter((row) => row.unread).length };
}

export async function mark_inbox_read(user_id: string, ids: string[]) {
  const clean = ids.filter((id) => typeof id === 'string' && id.length > 0).slice(0, list_limit);
  if (!is_user_id(user_id) || !clean.length) return;
  if (!use_cloud()) {
    await mark_legacy(user_id, clean);
    return;
  }

  const admin = create_service_client();
  const { error } = await admin
    .from('inbox_receipts')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user_id)
    .in('message_id', clean)
    .is('read_at', null);
  if (error && missing_table(error.message)) await mark_legacy(user_id, clean);
}
