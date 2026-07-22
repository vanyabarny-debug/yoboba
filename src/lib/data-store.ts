import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

function read_from_fs<T>(key: string, fallback: T): T {
  const file_path = join(data_dir, `${key}.json`);
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  if (!existsSync(file_path)) {
    const seed = (seeds[key] as T | undefined) ?? fallback;
    writeFileSync(file_path, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    return JSON.parse(readFileSync(file_path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function write_to_fs<T>(key: string, value: T) {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  writeFileSync(join(data_dir, `${key}.json`), JSON.stringify(value, null, 2), 'utf-8');
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
