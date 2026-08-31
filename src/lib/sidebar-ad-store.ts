import type { sidebar_ad_slide } from '@/lib/types';

export const sidebar_ad_store_version = 8;

const storage_key = 'yoboba_sidebar_ad_store';
const update_event = 'yoboba-sidebar-ad-update';

export const default_sidebar_interval_ms = 5000;

export const default_sidebar_slides: sidebar_ad_slide[] = [
  {
    id: 'side-viral',
    title: '25 000 просмотров = напиток',
    subtitle: 'короткое видео с упоминанием yomoyo',
    image_url: '/images/sidebar/slide-viral.png?v=3',
    link_url: '/',
    is_active: true,
  },
  {
    id: 'side-1',
    title: 'удобная оплата',
    subtitle: 'картой или на кассе',
    image_url: '/images/sidebar/slide1.png',
    is_active: true,
  },
  {
    id: 'side-2',
    title: 'приложение yomoyo',
    subtitle: 'ещё выгоднее в pwa',
    image_url: '/images/sidebar/slide2.png',
    link_url: '/',
    is_active: true,
  },
  {
    id: 'side-3',
    title: 'комбо недели',
    subtitle: 'бабл + закуска',
    image_url: '/images/sidebar/slide3.png',
    menu_id: 'cb-1',
    is_active: true,
  },
];

type sidebar_ad_store = {
  version: number;
  interval_ms: number;
  slides: sidebar_ad_slide[];
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

export function get_default_sidebar_ad_store(): sidebar_ad_store {
  return {
    version: sidebar_ad_store_version,
    interval_ms: default_sidebar_interval_ms,
    slides: default_sidebar_slides.map((s) => ({ ...s })),
  };
}

function repair_sidebar_store(store: sidebar_ad_store): sidebar_ad_store {
  const upgrading = (store.version ?? 0) < sidebar_ad_store_version;
  const by_id = new Map(store.slides.map((s) => [s.id, s]));
  for (const def of default_sidebar_slides) {
    const existing = by_id.get(def.id);
    by_id.set(def.id, {
      ...def,
      ...existing,
      title:
        existing?.title && /баблтишн/i.test(existing.title)
          ? def.title
          : upgrading
            ? def.title
            : existing?.title ?? def.title,
      subtitle: upgrading ? def.subtitle : existing?.subtitle ?? def.subtitle,
      image_url:
        upgrading || !existing?.image_url || existing.image_url.endsWith('.svg')
          ? def.image_url
          : existing.image_url,
      link_url: upgrading ? def.link_url : existing?.link_url ?? def.link_url,
      menu_id: upgrading ? def.menu_id : existing?.menu_id ?? def.menu_id,
      is_active: upgrading ? def.is_active : existing?.is_active ?? def.is_active,
    });
  }
  // порядок как в дефолтах, кастомные слайды — в конце
  const default_ids = new Set(default_sidebar_slides.map((s) => s.id));
  let slides = [
    ...default_sidebar_slides.map((def) => by_id.get(def.id)!),
    ...[...by_id.values()].filter((s) => !default_ids.has(s.id)),
  ];
  if (!slides.some((s) => s.is_active)) {
    slides = slides.map((s) =>
      default_sidebar_slides.some((d) => d.id === s.id) ? { ...s, is_active: true } : s
    );
  }
  if (!slides.length) {
    slides = default_sidebar_slides.map((s) => ({ ...s }));
  }
  const repaired = {
    version: sidebar_ad_store_version,
    interval_ms: store.interval_ms || default_sidebar_interval_ms,
    slides,
  };
  if (JSON.stringify(repaired) !== JSON.stringify(store)) {
    localStorage.setItem(storage_key, JSON.stringify(repaired));
  }
  return repaired;
}

export function get_sidebar_ad_store(): sidebar_ad_store {
  if (typeof window === 'undefined') return get_default_sidebar_ad_store();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_sidebar_ad_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as sidebar_ad_store;
    if (!parsed.version || parsed.version < sidebar_ad_store_version) {
      return repair_sidebar_store({
        ...get_default_sidebar_ad_store(),
        ...parsed,
        version: sidebar_ad_store_version,
      });
    }
    return repair_sidebar_store(parsed);
  } catch {
    const seed = get_default_sidebar_ad_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function save_sidebar_ad_store(store: sidebar_ad_store) {
  localStorage.setItem(
    storage_key,
    JSON.stringify({ ...store, version: sidebar_ad_store_version })
  );
  emit_update();
}

export function reset_sidebar_ad_store() {
  save_sidebar_ad_store(get_default_sidebar_ad_store());
}

export function subscribe_sidebar_ad_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function upsert_sidebar_slide(data: sidebar_ad_slide) {
  const store = get_sidebar_ad_store();
  const idx = store.slides.findIndex((s) => s.id === data.id);
  if (idx >= 0) store.slides[idx] = data;
  else store.slides.push(data);
  save_sidebar_ad_store(store);
}

export function delete_sidebar_slide(id: string) {
  const store = get_sidebar_ad_store();
  store.slides = store.slides.filter((s) => s.id !== id);
  save_sidebar_ad_store(store);
}

export function move_sidebar_slide(id: string, dir: -1 | 1) {
  const store = get_sidebar_ad_store();
  const idx = store.slides.findIndex((s) => s.id === id);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= store.slides.length) return;
  const list = [...store.slides];
  [list[idx], list[next]] = [list[next], list[idx]];
  store.slides = list;
  save_sidebar_ad_store(store);
}

export function set_sidebar_interval_ms(ms: number) {
  const store = get_sidebar_ad_store();
  store.interval_ms = Math.max(2000, ms);
  save_sidebar_ad_store(store);
}

export function new_sidebar_slide_id() {
  return `side-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
