import type { promo_banner } from '@/lib/types';

export const promo_store_version = 22;

const storage_key = 'yoboba_promo_store';
const update_event = 'yoboba-promo-update';

export const default_promos: promo_banner[] = [
  {
    id: 'promo-13',
    title: 'первые 100 бабл ти бесплатно',
    subtitle: 'подробности и правила — на странице акции',
    badge: 'до 01.09',
    image_url: '/images/promos/promo13.png?v=7',
    link_url: '/akciya-pervye-100',
    cta_label: 'условия акции',
    title_in_image: true,
    is_active: true,
  },
  {
    id: 'promo-14',
    title: 'студентам и школьникам −30%',
    subtitle: 'по дневнику или студенческому билету',
    badge: '−30%',
    image_url: '/images/promos/promo14.png?v=6',
    link_url: '/akciya-studentam',
    cta_label: 'условия скидки',
    title_in_image: true,
    is_active: true,
  },
  {
    id: 'promo-15',
    title: 'подари ей напиток',
    badge: 'подарок',
    image_url: '/images/promos/promo15.png?v=6',
    link_url: '/akciya-podari-napitok',
    cta_label: 'как подарить',
    title_in_image: true,
    is_active: true,
  },
  {
    id: 'promo-16',
    title: 'напиток месяца — subzero',
    subtitle: 'блюкюрасао · личи-ментол · кокосовое желе',
    badge: 'месяца',
    image_url: '/images/promos/promo16.png?v=7',
    link_url: '/napitok-mesyaca-subzero',
    cta_label: 'подробнее',
    title_in_image: true,
    is_active: true,
  },
];

type promo_store = {
  version: number;
  promos: promo_banner[];
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

export function get_default_promo_store(): promo_store {
  return {
    version: promo_store_version,
    promos: default_promos.map((p) => ({ ...p })),
  };
}

export function get_promo_store(): promo_store {
  if (typeof window === 'undefined') return get_default_promo_store();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_promo_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as promo_store;
    if (!parsed.version || parsed.version < promo_store_version) {
      const seed = get_default_promo_store();
      localStorage.setItem(storage_key, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    const seed = get_default_promo_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function save_promo_store(store: promo_store) {
  localStorage.setItem(
    storage_key,
    JSON.stringify({ ...store, version: promo_store_version })
  );
  emit_update();
}

export function reset_promo_store() {
  save_promo_store(get_default_promo_store());
}

export function subscribe_promo_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function upsert_promo(data: promo_banner) {
  const store = get_promo_store();
  const idx = store.promos.findIndex((p) => p.id === data.id);
  if (idx >= 0) store.promos[idx] = data;
  else store.promos.push(data);
  save_promo_store(store);
}

export function delete_promo(id: string) {
  const store = get_promo_store();
  store.promos = store.promos.filter((p) => p.id !== id);
  save_promo_store(store);
}

export function move_promo(id: string, dir: -1 | 1) {
  const store = get_promo_store();
  const idx = store.promos.findIndex((p) => p.id === id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= store.promos.length) return;
  const list = [...store.promos];
  [list[idx], list[next]] = [list[next], list[idx]];
  store.promos = list;
  save_promo_store(store);
}

export function new_promo_id() {
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
