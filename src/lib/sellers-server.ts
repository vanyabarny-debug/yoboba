import { read_json_store, write_json_store } from '@/lib/data-store';
import { hash_staff_password, is_hashed_password, verify_staff_password } from '@/lib/password-hash';
import { parse_push_categories } from '@/lib/push-categories';
import { parse_seller_access } from '@/lib/seller-access';
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
  const seller = sellers.find((s) => s.is_active && s.login.toLowerCase() === normalized) || null;
  if (!seller || !verify_staff_password(seller.password, password)) return null;
  if (!is_hashed_password(seller.password)) {
    seller.password = hash_staff_password(password);
    await save_sellers(sellers);
  }
  return seller;
}

export async function upsert_seller(
  input: Omit<seller, 'created_at'> & { created_at?: string }
): Promise<seller> {
  const sellers = await load_sellers();
  const idx = sellers.findIndex((s) => s.id === input.id);
  const record: seller = {
    ...input,
    login: input.login.trim().toLowerCase(),
    role_title: (input.role_title || 'бариста').trim().slice(0, 40) || 'бариста',
    access: parse_seller_access(input.access),
    push_categories: parse_push_categories(input.push_categories),
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
