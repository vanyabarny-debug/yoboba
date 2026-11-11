import { read_json_store, write_json_store } from '@/lib/data-store';

const store_key = 'app-inbox';
const max_messages = 160;
const max_image = 180_000;

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
  /** кому показать. пустой список не пишем */
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

let write_chain: Promise<unknown> = Promise.resolve();

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

async function load(): Promise<inbox_message[]> {
  const rows = await read_json_store<inbox_message[]>(store_key, []);
  return Array.isArray(rows) ? rows : [];
}

async function save(rows: inbox_message[]) {
  await write_json_store(store_key, rows.slice(0, max_messages));
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

  await with_lock(async () => {
    const rows = await load();
    rows.unshift(message);
    await save(rows);
  });

  return { id: message.id, recipients: user_ids.length };
}

export async function list_inbox(user_id: string): Promise<{ items: inbox_item[]; unread: number }> {
  if (!is_user_id(user_id)) return { items: [], unread: 0 };
  const rows = await load();
  const items = rows
    .filter((row) => row.user_ids.includes(user_id))
    .slice(0, 40)
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

export async function mark_inbox_read(user_id: string, ids: string[]) {
  if (!is_user_id(user_id) || !ids.length) return;
  const want = new Set(ids);
  await with_lock(async () => {
    const rows = await load();
    let changed = false;
    for (const row of rows) {
      if (!want.has(row.id) || !row.user_ids.includes(user_id) || row.read_by.includes(user_id)) {
        continue;
      }
      row.read_by.push(user_id);
      changed = true;
    }
    if (changed) await save(rows);
  });
}
