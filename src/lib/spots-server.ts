import { read_published_catalog } from '@/lib/published-catalog';
import { default_spots, spot_store_version, type spot_store } from '@/lib/spot-store';
import type { store_spot } from '@/lib/types';

/** точки с сервера (published catalog), иначе дефолт */
export async function read_spots(): Promise<store_spot[]> {
  const published = await read_published_catalog<spot_store>('spots');
  const spots = Array.isArray(published?.spots) ? published!.spots : [];
  if (spots.length) {
    return spots.map((s) => ({
      id: String(s.id),
      city: String(s.city || ''),
      address: String(s.address || ''),
      ...(s.label ? { label: String(s.label) } : {}),
      is_active: s.is_active !== false,
    }));
  }
  return default_spots.map((s) => ({ ...s }));
}

export async function read_active_spots(): Promise<store_spot[]> {
  return (await read_spots()).filter((s) => s.is_active);
}

export { spot_store_version };
