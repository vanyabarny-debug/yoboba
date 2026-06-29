import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sellers_seed from '../../data/sellers.json';

const data_dir = join(process.cwd(), 'data');

const seeds: Record<string, unknown> = {
  sellers: sellers_seed,
  'cash-transactions': [],
  'demo-orders': [],
};

async function get_kv() {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv).YOBOBA_DATA ?? null;
  } catch {
    return null;
  }
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
  return read_from_fs(key, fallback);
}

export async function write_json_store<T>(key: string, value: T): Promise<void> {
  const kv = await get_kv();
  if (kv) {
    await kv.put(key, JSON.stringify(value));
    return;
  }
  write_to_fs(key, value);
}
