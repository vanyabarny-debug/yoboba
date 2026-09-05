import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import sellers_seed from '../../data/sellers.json';

const data_dir = join(process.cwd(), 'data');
const memory_store = new Map<string, string>();

const seeds: Record<string, unknown> = {
  sellers: sellers_seed,
  'cash-transactions': [],
  'demo-orders': [],
  'prep-events': [],
  'fulfillment-events': [],
  'handed-orders': [],
  'demo-bonuses': [],
  gifts: [],
  'opening-100': [],
  'student-status': [],
  'push-subscriptions': [],
  'vapid-keys': null,
  'seller-prep-state': {},
  'seller-shifts': [],
};

async function get_cloudflare_env(): Promise<CloudflareEnv | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    return env as CloudflareEnv;
  } catch {
    return null;
  }
}

async function get_kv() {
  const env = await get_cloudflare_env();
  return env?.YOBOBA_DATA ?? null;
}

async function is_cloudflare_runtime() {
  return (await get_cloudflare_env()) !== null;
}

function sleep_sync_ms(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin — короткий ретрай чтения при гонке записи */
  }
}

function read_from_fs<T>(key: string, fallback: T): T {
  const file_path = join(data_dir, `${key}.json`);
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  if (!existsSync(file_path)) {
    const seed = (seeds[key] as T | undefined) ?? fallback;
    write_to_fs(key, seed);
    return seed;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(readFileSync(file_path, 'utf-8')) as T;
    } catch {
      if (attempt < 2) sleep_sync_ms(15);
    }
  }
  return fallback;
}

/** атомарная запись: tmp + rename, чтобы параллельный read не видел пустой/битый JSON */
function write_to_fs<T>(key: string, value: T) {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  const file_path = join(data_dir, `${key}.json`);
  const tmp = join(data_dir, `.${key}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
  try {
    renameSync(tmp, file_path);
  } catch {
    try {
      unlinkSync(file_path);
    } catch {
      /* ignore */
    }
    renameSync(tmp, file_path);
  }
}

export async function read_json_store<T>(key: string, fallback: T): Promise<T> {
  const kv = await get_kv();
  if (kv) {
    const raw = await kv.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    }
    const seed = (seeds[key] as T | undefined) ?? fallback;
    await kv.put(key, JSON.stringify(seed));
    return seed;
  }

  if (await is_cloudflare_runtime()) {
    const raw = memory_store.get(key);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    }
    const seed = (seeds[key] as T | undefined) ?? fallback;
    memory_store.set(key, JSON.stringify(seed));
    return seed;
  }

  return read_from_fs(key, fallback);
}

export async function write_json_store<T>(key: string, value: T): Promise<void> {
  const kv = await get_kv();
  if (kv) {
    await kv.put(key, JSON.stringify(value));
    return;
  }

  if (await is_cloudflare_runtime()) {
    memory_store.set(key, JSON.stringify(value));
    return;
  }

  write_to_fs(key, value);
}
