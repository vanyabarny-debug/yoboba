import type { store_spot } from '@/lib/types';

export const spot_store_version = 1;

const storage_key = 'yoboba_spot_store';
const update_event = 'yoboba-spot-update';

export const default_spots: store_spot[] = [
  {
    id: 'spot-kimry-1',
    city: 'кимры',
    address: 'Кимры, ул. Урицкого, 12',
    label: 'центр',
    is_active: true,
  },
];

type spot_store = {
  version: number;
  spots: store_spot[];
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

export function get_default_spot_store(): spot_store {
  return {
    version: spot_store_version,
    spots: default_spots.map((s) => ({ ...s })),
  };
}

function repair_spot_store(store: spot_store): spot_store {
  const by_id = new Map(store.spots.map((s) => [s.id, s]));
  for (const def of default_spots) {
    const existing = by_id.get(def.id);
    by_id.set(def.id, {
      ...def,
      ...existing,
      address: existing?.address || def.address,
      is_active: existing?.is_active ?? def.is_active,
    });
  }
  let spots = [...by_id.values()];
  if (!spots.some((s) => s.is_active)) {
    spots = spots.map((s) =>
      default_spots.some((d) => d.id === s.id) ? { ...s, is_active: true } : s
    );
  }
  if (!spots.length) {
    spots = default_spots.map((s) => ({ ...s }));
  }
  const repaired = { version: spot_store_version, spots };
  if (typeof window !== 'undefined' && JSON.stringify(repaired) !== JSON.stringify(store)) {
    localStorage.setItem(storage_key, JSON.stringify(repaired));
  }
  return repaired;
}

export function get_spot_store(): spot_store {
  if (typeof window === 'undefined') return get_default_spot_store();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_spot_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as spot_store;
    if (!parsed.version || parsed.version < spot_store_version) {
      return repair_spot_store({
        ...get_default_spot_store(),
        ...parsed,
        version: spot_store_version,
      });
    }
    return repair_spot_store(parsed);
  } catch {
    const seed = get_default_spot_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function get_spots(): store_spot[] {
  return get_spot_store().spots;
}

export function get_active_spots(): store_spot[] {
  return get_spots().filter((s) => s.is_active);
}

export function save_spot_store(store: spot_store) {
  localStorage.setItem(storage_key, JSON.stringify({ ...store, version: spot_store_version }));
  emit_update();
}

export function reset_spot_store() {
  save_spot_store(get_default_spot_store());
}

export function subscribe_spot_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function upsert_spot(data: store_spot) {
  const store = get_spot_store();
  const idx = store.spots.findIndex((s) => s.id === data.id);
  if (idx >= 0) store.spots[idx] = data;
  else store.spots.push(data);
  save_spot_store(store);
}

export function delete_spot(id: string) {
  const store = get_spot_store();
  store.spots = store.spots.filter((s) => s.id !== id);
  save_spot_store(store);
}

export function new_spot_id() {
  return `spot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
