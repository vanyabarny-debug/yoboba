import type { promo_banner } from '@/lib/types';

import {
  default_promo_title_layout,
  standard_promo_title_layout,
} from '@/lib/promo-title-layout';
import {
  default_promo_image_vignette,
  standard_promo_vignette,
} from '@/lib/promo-image-vignette';

export const promo_store_version = 44;

const storage_key = 'yoboba_promo_store';
const update_event = 'yoboba-promo-update';

export const default_promos: promo_banner[] = [
  {
    id: 'promo-13',
    title: 'бесплатно нальём\nсамым быстрым',
    subtitle: '100 напитков · подписка, лайк, репост',
    badge: '100 шт',
    image_url: '/images/promos/promo13.png?v=9',
    link_url: '/akciya-pervye-100',
    cta_label: 'условия',
    title_in_image: false,
    title_layout: standard_promo_title_layout({ font_size: 16 }),
    image_vignette: standard_promo_vignette(),
    is_active: true,
  },
  {
    id: 'promo-14',
    title: 'студентам и\nшкольникам −30%',
    subtitle: 'по дневнику или студенческому билету',
    badge: '−30%',
    image_url: '/images/promos/promo14.png?v=9',
    link_url: '/akciya-studentam',
    cta_label: 'условия скидки',
    title_in_image: false,
    title_layout: standard_promo_title_layout({ font_size: 17 }),
    image_vignette: standard_promo_vignette(),
    is_active: true,
  },
  {
    id: 'promo-15',
    title: 'подари ей\nнапиток',
    badge: 'подарок',
    image_url: '/images/promos/promo15.png?v=9',
    link_url: '/akciya-podari-napitok',
    cta_label: 'как подарить',
    title_in_image: false,
    title_layout: standard_promo_title_layout({ font_size: 18 }),
    image_vignette: standard_promo_vignette(),
    is_active: true,
  },
  {
    id: 'promo-16',
    title: 'напиток месяца\nsubzero',
    subtitle: 'блюкюрасао · личи-ментол · кокосовое желе',
    badge: 'месяца',
    image_url: '/images/promos/promo-subzero.png?v=5',
    link_url: '/napitok-mesyaca-subzero',
    menu_id: 'subzero',
    category: 'напиток месяца',
    cta_label: 'подробнее',
    title_in_image: false,
    title_layout: default_promo_title_layout({
      font_size: 17,
      font_weight: 800,
      x_pct: 50,
      y_pct: 10,
      anchor: 'top-center',
      text_align: 'center',
      color: '#ffffff',
      shadow: true,
      stroke: false,
    }),
    image_vignette: default_promo_image_vignette({ edge: 'top', strength: 34 }),
    is_active: true,
  },
  {
    id: 'promo-17',
    title: 'с друзьями\nдешевле',
    badge: 'комбо',
    image_url: '/images/promos/promo-druzhba.png?v=2',
    menu_id: 'combo-druzhba',
    category: 'комбо',
    cta_label: 'собрать комбо',
    title_in_image: false,
    title_layout: default_promo_title_layout({
      font_size: 18,
      x_pct: 50,
      y_pct: 82,
      anchor: 'bottom-center',
      text_align: 'center',
    }),
    is_active: true,
  },
  {
    id: 'promo-18',
    title: 'ищем\nбариста',
    subtitle: 'присоединяйся к команде yomoyo',
    badge: 'работа',
    image_url: '/images/promos/promo-barista.png?v=3',
    link_url: '/rabota',
    cta_label: 'узнать больше',
    title_in_image: false,
    title_layout: standard_promo_title_layout({ font_size: 18 }),
    image_vignette: standard_promo_vignette(),
    is_active: true,
  },
];

type promo_store = {
  version: number;
  promos: promo_banner[];
  /** дефолтные id, которые админ уже удалил — не поднимать снова из кода */
  removed_ids?: string[];
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

function default_promo_ids() {
  return new Set(default_promos.map((p) => p.id));
}

export function get_default_promo_store(): promo_store {
  return {
    version: promo_store_version,
    promos: default_promos.map((p) => ({ ...p })),
    removed_ids: [],
  };
}

function merge_with_code_defaults(parsed: promo_store): promo_store {
  const default_ids = default_promo_ids();
  const default_by_id = new Map(default_promos.map((def) => [def.id, def]));
  const upgrading = (parsed.version ?? 0) < promo_store_version;

  const removed = new Set(
    (parsed.removed_ids ?? []).filter((id) => typeof id === 'string' && id)
  );
  // при апгрейде вернуть дефолтные акции, если их случайно удалили/выключили
  if (upgrading) {
    for (const id of default_ids) removed.delete(id);
  }

  const saved = (parsed.promos ?? []).filter(
    (promo) => promo?.id && !removed.has(promo.id)
  );

  function merge_one(def: promo_banner, prev: promo_banner): promo_banner {
    const merged: promo_banner = { ...def, ...prev, image_url: def.image_url };
    if (upgrading) {
      merged.title = def.title;
      merged.title_in_image = def.title_in_image;
      merged.is_active = def.is_active;
      if (def.title_layout) merged.title_layout = def.title_layout;
      if (def.image_vignette !== undefined) merged.image_vignette = def.image_vignette;
    }
    return merged;
  }

  const next: promo_banner[] = [];
  const seen = new Set<string>();

  // сохраняем порядок из localStorage
  for (const promo of saved) {
    seen.add(promo.id);
    const def = default_by_id.get(promo.id);
    if (def) {
      next.push(merge_one(def, promo));
      continue;
    }
    if (!default_ids.has(promo.id)) {
      next.push(promo);
    }
  }

  // новые / восстановленные дефолтные акции
  for (const def of default_promos) {
    if (removed.has(def.id) || seen.has(def.id)) continue;
    next.push({ ...def });
  }

  return {
    version: promo_store_version,
    promos: next,
    removed_ids: [...removed],
  };
}

export function get_promo_store(): promo_store {
  if (typeof window === 'undefined') return get_default_promo_store();
  const raw = localStorage.getItem(storage_key);
  const seed = get_default_promo_store();
  if (!raw) {
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as promo_store;
    const merged = merge_with_code_defaults(parsed);
    if (
      parsed.version !== merged.version ||
      JSON.stringify(parsed.promos) !== JSON.stringify(merged.promos)
    ) {
      localStorage.setItem(storage_key, JSON.stringify(merged));
    }
    return merged;
  } catch {
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
  if (store.removed_ids?.includes(data.id)) {
    store.removed_ids = store.removed_ids.filter((id) => id !== data.id);
  }
  save_promo_store(store);
}

export function delete_promo(id: string) {
  const store = get_promo_store();
  store.promos = store.promos.filter((p) => p.id !== id);
  if (default_promo_ids().has(id)) {
    store.removed_ids = [...new Set([...(store.removed_ids ?? []), id])];
  }
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

export function reorder_promos(from_index: number, to_index: number) {
  const store = get_promo_store();
  const list = [...store.promos];
  if (
    from_index < 0 ||
    to_index < 0 ||
    from_index >= list.length ||
    to_index >= list.length ||
    from_index === to_index
  ) {
    return;
  }
  const [item] = list.splice(from_index, 1);
  list.splice(to_index, 0, item);
  store.promos = list;
  save_promo_store(store);
}

export function new_promo_id() {
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
