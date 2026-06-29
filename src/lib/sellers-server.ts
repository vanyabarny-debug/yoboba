import { read_json_store, write_json_store } from '@/lib/data-store';
import type { seller } from '@/lib/types';

const store_key = 'sellers';

async function load_sellers(): Promise<seller[]> {
  return read_json_store<seller[]>(store_key, []);
}

async function save_sellers(sellers: seller[]) {
  await write_json_store(store_key, sellers);
}

export async function get_sellers(): Promise<seller[]> {
  return load_sellers();
}

export async function find_seller_by_credentials(
  login: string,
  password: string
): Promise<seller | null> {
  const normalized = login.trim().toLowerCase();
  const sellers = await load_sellers();
  return (
    sellers.find(
      (s) => s.is_active && s.login.toLowerCase() === normalized && s.password === password
    ) || null
  );
}

export async function upsert_seller(
  input: Omit<seller, 'created_at'> & { created_at?: string }
): Promise<seller> {
  const sellers = await load_sellers();
  const idx = sellers.findIndex((s) => s.id === input.id);
  const record: seller = {
    ...input,
    login: input.login.trim().toLowerCase(),
    created_at: input.created_at || new Date().toISOString(),
  };
  if (idx >= 0) sellers[idx] = record;
  else sellers.push(record);
  await save_sellers(sellers);
  return record;
}

export async function delete_seller(id: string): Promise<boolean> {
  const sellers = await load_sellers();
  const next = sellers.filter((s) => s.id !== id);
  if (next.length === sellers.length) return false;
  await save_sellers(next);
  return true;
}
