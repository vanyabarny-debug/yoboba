import type { published_catalog_key } from '@/lib/published-catalog';

const timers: Partial<Record<published_catalog_key, number>> = {};

export function publish_catalog_now(key: published_catalog_key, value: unknown) {
  if (typeof window === 'undefined') return;
  void fetch(`/api/admin/published/${key}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export function schedule_publish_catalog(key: published_catalog_key, value: unknown) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(timers[key]);
  timers[key] = window.setTimeout(() => publish_catalog_now(key, value), 400);
}

export function hydrate_catalog<T>(key: published_catalog_key): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return fetch(`/api/published/${key}`, { cache: 'no-store' })
    .then((r) => r.json())
    .then((body: { store?: T | null }) => (body?.store ? body.store : null))
    .catch(() => null);
}
