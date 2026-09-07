import { read_json_store, write_json_store } from '@/lib/data-store';

export const PUBLISHED_CATALOG_KEYS = [
  'promos',
  'sidebar-ads',
  'brand',
  'site-content',
  'spots',
] as const;

export type published_catalog_key = (typeof PUBLISHED_CATALOG_KEYS)[number];

function store_key(key: published_catalog_key) {
  return `published-${key}`;
}

export function is_published_catalog_key(value: string): value is published_catalog_key {
  return (PUBLISHED_CATALOG_KEYS as readonly string[]).includes(value);
}

export async function read_published_catalog<T>(
  key: published_catalog_key
): Promise<T | null> {
  return read_json_store<T | null>(store_key(key), null);
}

export async function write_published_catalog<T>(
  key: published_catalog_key,
  value: T
): Promise<T> {
  await write_json_store(store_key(key), value);
  return value;
}
