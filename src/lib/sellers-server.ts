import { write_json_store } from '@/lib/data-store';
import { has_durable_row, read_durable_json, write_durable_json } from '@/lib/durable-json';
import { hash_staff_password, is_hashed_password, verify_staff_password } from '@/lib/password-hash';
import { parse_push_categories } from '@/lib/push-categories';
import { parse_seller_access } from '@/lib/seller-access';
import { seal_staff_password } from '@/lib/staff-password-vault';
import type { seller } from '@/lib/types';

const store_key = 'sellers';
/** dev смотрит в тот же supabase — его тестовый список не должен стать облачным раньше прода */
const owns_cloud_seed = process.env.NODE_ENV === 'production';

async function load_sellers(): Promise<seller[]> {
  const rows = await read_durable_json<seller[]>(store_key, [], { migrate: owns_cloud_seed });
  return Array.isArray(rows) ? rows : [];
}

async function save_sellers(sellers: seller[]) {
  if (!owns_cloud_seed && !(await has_durable_row(store_key))) {
    await write_json_store(store_key, sellers);
    return;
  }
  await write_durable_json(store_key, sellers);
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
  let changed = false;
  if (!is_hashed_password(seller.password)) {
    seller.password = hash_staff_password(password);
    changed = true;
  }
  if (!seller.password_view) {
    seller.password_view = seal_staff_password(password);
    changed = Boolean(seller.password_view) || changed;
  }
  if (changed) await save_sellers(sellers);
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
