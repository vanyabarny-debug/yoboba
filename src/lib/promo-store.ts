import type { promo_banner } from '@/lib/types';

export const promo_store_version = 8;

const storage_key = 'yoboba_promo_store';
const update_event = 'yoboba-promo-update';

export const default_promos: promo_banner[] = [
  {
    id: 'promo-1',
    title: '2=3 на классику',
    image_url: '/images/promos/promo1.png',
    category: 'классические бабл ти',
    is_active: true,
  },
  {
    id: 'promo-2',
    title: 'комбо выходного',
    image_url: '/images/promos/promo2.png',
    menu_id: 'cb-1',
    is_active: true,
  },
  {
    id: 'promo-3',
    title: 'матча недели',
    image_url: '/images/promos/promo3.png',
    category: 'матча',
    is_active: true,
  },
  {
    id: 'promo-4',
    title: 'приложение yomoyo',
    image_url: '/images/promos/promo4.png',
    link_url: '/',
    is_active: true,
  },
  {
    id: 'promo-5',
    title: '−20% на джусболы',
    image_url: '/images/promos/promo1.png',
    category: 'с джусболами',
    is_active: true,
  },
  {
    id: 'promo-6',
    title: 'фраппе дня',
    image_url: '/images/promos/promo3.png',
    category: 'фраппе',
    is_active: true,
  },
  {
    id: 'promo-7',
    title: 'пп меню',
    image_url: '/images/promos/promo4.png',
    category: 'пп',
    is_active: true,
  },
  {
    id: 'promo-8',
    title: 'закуски к чаю',
    image_url: '/images/promos/promo2.png',
    category: 'закуски',
    is_active: true,
  },
  {
    id: 'promo-9',
    title: 'десерт в подарок',
    image_url: '/images/promos/promo2.png',
    category: 'десерты',
    is_active: true,
  },
  {
    id: 'promo-10',
    title: 'бабл тоники',
    image_url: '/images/promos/promo1.png',
    category: 'бабл тоники',
    is_active: true,
  },
  {
    id: 'promo-11',
    title: 'газированные новинки',
    image_url: '/images/promos/promo3.png',
    category: 'газированные бабл ти',
    is_active: true,
  },
  {
    id: 'promo-12',
    title: 'triple combo',
    image_url: '/images/promos/promo2.png',
    menu_id: 'cb-4',
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
