import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { seller } from '@/lib/types';

const data_dir = join(process.cwd(), 'data');
const file_path = join(data_dir, 'sellers.json');

function ensure_file(): seller[] {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  if (!existsSync(file_path)) {
    writeFileSync(file_path, '[]', 'utf-8');
    return [];
  }
  try {
    return JSON.parse(readFileSync(file_path, 'utf-8')) as seller[];
  } catch {
    return [];
  }
}

function save(sellers: seller[]) {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  writeFileSync(file_path, JSON.stringify(sellers, null, 2), 'utf-8');
}

export function get_sellers(): seller[] {
  return ensure_file();
}

export function find_seller_by_credentials(login: string, password: string): seller | null {
  const normalized = login.trim().toLowerCase();
  return (
    ensure_file().find(
      (s) => s.is_active && s.login.toLowerCase() === normalized && s.password === password
    ) || null
  );
}

export function upsert_seller(input: Omit<seller, 'created_at'> & { created_at?: string }): seller {
  const sellers = ensure_file();
  const idx = sellers.findIndex((s) => s.id === input.id);
  const record: seller = {
    ...input,
    login: input.login.trim().toLowerCase(),
    created_at: input.created_at || new Date().toISOString(),
  };
  if (idx >= 0) sellers[idx] = record;
  else sellers.push(record);
  save(sellers);
  return record;
}

export function delete_seller(id: string): boolean {
  const sellers = ensure_file();
  const next = sellers.filter((s) => s.id !== id);
  if (next.length === sellers.length) return false;
  save(next);
  return true;
}
