import type { menu_badge_color, menu_item } from '@/lib/types';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import type { heading_style } from '@/lib/heading-style';
import { default_category_heading_styles } from '@/lib/heading-style';
import {
  drop_item_category,
  item_categories,
  rename_item_category,
  set_item_categories,
} from '@/lib/menu-item-categories';

export const store_version = 18;

export const default_categories = [
  'классические бабл ти',
  'с джусболами',
  'матча',
  'пп',
  'фраппе',
  'газированные бабл ти',
  'бабл тоники',
  'закуски',
  'десерты',
  'комбо',
];

const local = (name: string) => `/images/menu/${name}.png`;

const img = {
  'bt-1': local('bt-1'),
  'bt-2': local('bt-2'),
  'bt-3': local('bt-3'),
  'bt-4': local('bt-4'),
  'bt-5': local('bt-5'),
  'bt-6': local('bt-6'),
  'bt-7': local('bt-7'),
  'jb-1': local('jb-1'),
  'jb-2': local('jb-2'),
  'jb-3': local('jb-3'),
  'jb-4': local('jb-4'),
  'jb-5': local('jb-5'),
  'jb-6': local('jb-6'),
  'mt-1': local('mt-1'),
  'mt-2': local('mt-2'),
  'mt-3': local('mt-3'),
  'mt-4': local('mt-4'),
  'mt-5': local('mt-5'),
  'mt-6': local('mt-6'),
  'pp-1': local('pp-1'),
  'pp-2': local('pp-2'),
  'pp-3': local('pp-3'),
  'pp-4': local('pp-4'),
  'pp-5': local('pp-5'),
  'fr-1': local('fr-1'),
  'fr-2': local('fr-2'),
  'fr-3': local('fr-3'),
  'fr-4': local('fr-4'),
  'fr-5': local('fr-5'),
  'gb-1': local('gb-1'),
  'gb-2': local('gb-2'),
  'gb-3': local('gb-3'),
  'gb-4': local('gb-4'),
  'gb-5': local('gb-5'),
  'tn-1': local('tn-1'),
  'tn-2': local('tn-2'),
  'tn-3': local('tn-3'),
  'tn-4': local('tn-4'),
  'sn-1': local('sn-1'),
  'sn-2': local('sn-2'),
  'sn-3': local('sn-3'),
  'sn-4': local('sn-4'),
  'sn-5': local('sn-5'),
  'sn-6': local('sn-6'),
  'ds-1': local('ds-1'),
  'ds-2': local('ds-2'),
  'ds-3': local('ds-3'),
  'ds-4': local('ds-4'),
  'ds-5': local('ds-5'),
  'ds-6': local('ds-6'),
  'cb-1': local('cb-1'),
  'cb-2': local('cb-2'),
  'cb-3': local('cb-3'),
  'cb-4': local('cb-4'),
  'cb-5': local('cb-5'),
};

const placeholder_pool = Object.values(img);

function placeholder_for_id(id: string) {
  const keyed = img[id as keyof typeof img];
  if (keyed) return keyed;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % placeholder_pool.length;
  return placeholder_pool[hash] ?? img['bt-1'];
}

function normalize_item_name(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function find_default_item(item: menu_item, by_id: Map<string, menu_item>, by_name: Map<string, menu_item>) {
  return by_id.get(item.id) ?? by_name.get(normalize_item_name(item.name));
}

function is_stale_menu_placeholder(url: string) {
  // старые SVG-плейсхолдеры и чужие имена — заменить на актуальные PNG
  if (!url.startsWith('/images/menu/')) return false;
  if (url.endsWith('.svg')) return true;
  const base = url.slice('/images/menu/'.length).replace(/\.[^.]+$/, '');
  return !(base in img);
}

function resolve_image_url(item: menu_item, fallback?: menu_item): string {
  const url = (item.image_url || '').trim();

  // кастомное фото из админки (data/blob)
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  // актуальный локальный PNG
  if (url.startsWith('/images/menu/') && !is_stale_menu_placeholder(url)) {
    return url;
  }

  // дефолт по id/названию — надёжнее битых https из БД
  if (fallback?.image_url) {
    return fallback.image_url;
  }

  // внешний url, если дефолта нет (уникальные позиции)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  return placeholder_for_id(item.id);
}

/** запасной url, если основной http/cdn упал */
export function resolve_menu_item_fallback_image_url(item: menu_item): string | null {
  const { by_id, by_name } = get_default_lookups();
  const fallback = find_default_item(item, by_id, by_name);
  if (fallback?.image_url) return fallback.image_url;
  const ph = placeholder_for_id(item.id);
  return ph || null;
}

let default_lookups: {
  by_id: Map<string, menu_item>;
  by_name: Map<string, menu_item>;
} | null = null;

function get_default_lookups() {
  if (!default_lookups) {
    default_lookups = {
      by_id: new Map(default_menu_items.map((i) => [i.id, i])),
      by_name: new Map(default_menu_items.map((i) => [normalize_item_name(i.name), i])),
    };
  }
  return default_lookups;
}

/** единая точка: всегда отдаёт рабочий url картинки для карточки */
export function resolve_menu_item_image_url(item: menu_item): string {
  const { by_id, by_name } = get_default_lookups();
  const fallback = find_default_item(item, by_id, by_name);
  return resolve_image_url(item, fallback);
}

function item(
  id: string,
  name: string,
  price: number,
  category: string,
  image_url: string,
  recommendations: string[] = [],
  badge?: { text: string; color?: menu_badge_color }
): menu_item {
  return {
    id,
    name,
    price,
    category,
    image_url,
    is_available: true,
    recommendations,
    prep_minutes: DEFAULT_PREP_MINUTES,
    ...(badge ? { badge_text: badge.text, badge_color: 'orange' as const } : {}),
  };
}

export const default_menu_items: menu_item[] = [
  item('bt-1', 'классик молочный', 290, 'классические бабл ти', img['bt-1'], ['bt-2']),
  item('bt-2', 'таро с молоком', 310, 'классические бабл ти', img['bt-2']),
  item('bt-3', 'чёрный сахар', 330, 'классические бабл ти', img['bt-3'], [], { text: 'хит', color: 'accent' }),
  item('bt-4', 'oolong молочный', 300, 'классические бабл ти', img['bt-4']),
  item('bt-5', 'jasmine green', 295, 'классические бабл ти', img['bt-5']),
  item('bt-6', 'кокос классик', 320, 'классические бабл ти', img['bt-6']),
  item('bt-7', 'малина молочная', 340, 'классические бабл ти', img['bt-7'], [], { text: 'новинка', color: 'pink' }),
  item('jb-1', 'манго джусбол', 350, 'с джусболами', img['jb-1'], ['jb-2']),
  item('jb-2', 'личи джусбол', 350, 'с джусболами', img['jb-2']),
  item('jb-3', 'клубника джусбол', 360, 'с джусболами', img['jb-3']),
  item('jb-4', 'passion fruit', 370, 'с джусболами', img['jb-4'], [], { text: 'новинка', color: 'pink' }),
  item('jb-5', 'blueberry pop', 360, 'с джусболами', img['jb-5']),
  item('jb-6', 'персик джусбол', 355, 'с джусболами', img['jb-6']),
  item('mt-1', 'матча латте', 320, 'матча', img['mt-1'], ['mt-2'], { text: 'хит', color: 'accent' }),
  item('mt-2', 'матча бабл ти', 340, 'матча', img['mt-2']),
  item('mt-3', 'матча frappe lite', 330, 'матча', img['mt-3']),
  item('mt-4', 'матча кокос', 345, 'матча', img['mt-4']),
  item('mt-5', 'ice matcha', 335, 'матча', img['mt-5']),
  item('mt-6', 'матча oreo', 360, 'матча', img['mt-6'], [], { text: 'новинка', color: 'pink' }),
  item('pp-1', 'протеин бабл', 280, 'пп', img['pp-1'], [], { text: 'пп', color: 'green' }),
  item('pp-2', 'смузи зелёный', 270, 'пп', img['pp-2']),
  item('pp-3', 'лайт манго', 260, 'пп', img['pp-3']),
  item('pp-4', 'огуречный fresh', 255, 'пп', img['pp-4']),
  item('pp-5', 'berry protein', 285, 'пп', img['pp-5']),
  item('fr-1', 'карамель фраппе', 360, 'фраппе', img['fr-1'], ['fr-2']),
  item('fr-2', 'шоколад фраппе', 370, 'фраппе', img['fr-2']),
  item('fr-3', 'ваниль фраппе', 350, 'фраппе', img['fr-3']),
  item('fr-4', 'матча фраппе', 365, 'фраппе', img['fr-4']),
  item('fr-5', 'cookies фраппе', 375, 'фраппе', img['fr-5'], [], { text: 'топ', color: 'orange' }),
  item('gb-1', 'лимон газированный', 300, 'газированные бабл ти', img['gb-1']),
  item('gb-2', 'грейпфрут spark', 310, 'газированные бабл ти', img['gb-2']),
  item('gb-3', 'yuzu spark', 320, 'газированные бабл ти', img['gb-3'], [], { text: 'новинка', color: 'pink' }),
  item('gb-4', 'cola bubble', 305, 'газированные бабл ти', img['gb-4']),
  item('gb-5', 'виноград spark', 315, 'газированные бабл ти', img['gb-5']),
  item(
    'gb-6',
    'subzero',
    340,
    'газированные бабл ти',
    '/images/promos/promo16.png?v=7',
    [],
    { text: 'месяца', color: 'orange' }
  ),
  item('tn-1', 'бабл тоник бузина', 290, 'бабл тоники', img['tn-1']),
  item('tn-2', 'бабл тоник лайм', 280, 'бабл тоники', img['tn-2']),
  item('tn-3', 'имбирный тоник', 295, 'бабл тоники', img['tn-3']),
  item('tn-4', 'тоник маракуйя', 300, 'бабл тоники', img['tn-4']),
  item('sn-1', 'круассан', 180, 'закуски', img['sn-1']),
  item('sn-2', 'сырная палочка', 160, 'закуски', img['sn-2']),
  item('sn-3', 'эдамame', 150, 'закуски', img['sn-3']),
  item('sn-4', 'онигири', 170, 'закуски', img['sn-4']),
  item('sn-5', 'matcha chips', 140, 'закуски', img['sn-5']),
  item('sn-6', 'mochi sticks', 155, 'закуски', img['sn-6']),
  item('ds-1', 'тирамису', 320, 'десерты', img['ds-1']),
  item('ds-2', 'чизкейк', 340, 'десерты', img['ds-2'], [], { text: 'хит', color: 'accent' }),
  item('ds-3', 'mochi trio', 290, 'десерты', img['ds-3']),
  item('ds-4', 'brownie', 310, 'десерты', img['ds-4']),
  item('ds-5', 'macaron box', 350, 'десерты', img['ds-5']),
  item('ds-6', 'panna cotta', 300, 'десерты', img['ds-6']),
  item('cb-1', 'бабл + круассан', 420, 'комбо', img['cb-1'], ['cb-2']),
  item('cb-2', 'матча + десерт', 580, 'комбо', img['cb-2']),
  item('cb-3', 'двойной бабл', 520, 'комбо', img['cb-3']),
  item('cb-4', 'triple bubble', 650, 'комбо', img['cb-4'], [], { text: 'выгодно', color: 'orange' }),
  item('cb-5', 'семейный сет', 890, 'комбо', img['cb-5'], [], { text: '-15%', color: 'dark' }),
];

export type menu_store = {
  version: number;
  categories: string[];
  items: menu_item[];
  removed_item_ids?: string[];
  /** soft = Nunito, playful = Caveat */
  category_heading_styles?: Record<string, heading_style>;
};

const storage_key = 'yoboba_menu_store';
const update_event = 'yoboba-menu-update';

let published_heading_styles: Record<string, heading_style> | null = null;
let publish_timer: number | undefined;

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

export function apply_published_heading_styles(
  styles?: Record<string, heading_style> | null
) {
  published_heading_styles = styles ?? null;
}

function publish_payload(store: menu_store) {
  return JSON.stringify({ ...store, version: store_version });
}

export function publish_menu_now(store: menu_store = get_menu_store()) {
  if (typeof window === 'undefined') return;
  void fetch('/api/admin/menu', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: publish_payload(store),
  });
}

function schedule_publish(store: menu_store) {
  if (typeof window === 'undefined') return;
  window.clearTimeout(publish_timer);
  publish_timer = window.setTimeout(() => publish_menu_now(store), 400);
}

function merge_default_badges(items: menu_item[]) {
  const default_by_id = new Map(default_menu_items.map((i) => [i.id, i]));
  const default_by_name = new Map(default_menu_items.map((i) => [i.name.trim().toLowerCase(), i]));

  return items.map((item) => {
    const fallback =
      default_by_id.get(item.id) ?? default_by_name.get(item.name.trim().toLowerCase());

    if (item.badge_text?.trim()) {
      return { ...item, badge_color: 'orange' as menu_badge_color };
    }

    // undefined/null → подтянуть дефолт; '' → пользователь выключил плашку
    if (item.badge_text !== undefined && item.badge_text !== null) {
      return item;
    }

    if (fallback?.badge_text?.trim()) {
      return {
        ...item,
        badge_text: fallback.badge_text,
        badge_color: 'orange' as menu_badge_color,
      };
    }
    return item;
  });
}

export function apply_menu_item_badges(items: menu_item[]) {
  return merge_default_badges(items);
}

/** чинит старые SVG / рандомные png из БД — матч по id или по названию */
export function normalize_menu_item_images(items: menu_item[]) {
  const default_by_id = new Map(default_menu_items.map((i) => [i.id, i]));
  const default_by_name = new Map(
    default_menu_items.map((i) => [normalize_item_name(i.name), i])
  );
  return items.map((item) => {
    const fallback = find_default_item(item, default_by_id, default_by_name);
    return { ...item, image_url: resolve_image_url(item, fallback) };
  });
}

function repair_menu_store(store: menu_store): menu_store {
  const defaults = get_default_store();
  const removed = new Set(store.removed_item_ids ?? []);
  const categories =
    store.categories?.length > 0 ? store.categories : defaults.categories;
  const default_by_id = new Map(defaults.items.map((i) => [i.id, i]));
  const default_by_name = new Map(
    defaults.items.map((i) => [normalize_item_name(i.name), i])
  );
  const existing_ids = new Set((store.items ?? []).map((i) => i.id));
  const items = merge_default_badges(
    (store.items ?? []).map((item) => {
      const fallback = find_default_item(item, default_by_id, default_by_name);
      const known_cats = item_categories(item).filter((c) => categories.includes(c));
      const category = known_cats[0]
        ?? (categories.includes(item.category) ? item.category : null)
        ?? fallback?.category
        ?? categories[0];
      const image_url = resolve_image_url(item, fallback);
      const prep_minutes =
        typeof item.prep_minutes === 'number' && item.prep_minutes > 0
          ? item.prep_minutes
          : fallback?.prep_minutes ?? DEFAULT_PREP_MINUTES;
      return {
        ...item,
        category,
        categories: known_cats.length ? known_cats : [category],
        image_url,
        prep_minutes,
      };
    })
  );
  for (const def of defaults.items) {
    if (!existing_ids.has(def.id) && !removed.has(def.id)) {
      items.push({ ...def, image_url: resolve_image_url(def, def) });
    }
  }
  const repaired = {
    version: store_version,
    categories,
    items,
    removed_item_ids: store.removed_item_ids ?? [],
    category_heading_styles: {
      ...default_category_heading_styles,
      ...(store.category_heading_styles ?? {}),
    },
  };
  if (JSON.stringify(repaired) !== JSON.stringify(store)) {
    localStorage.setItem(storage_key, JSON.stringify(repaired));
  }
  return repaired;
}

export function get_default_store(): menu_store {
  return {
    version: store_version,
    categories: [...default_categories],
    items: default_menu_items.map((i) => ({ ...i })),
    removed_item_ids: [],
    category_heading_styles: { ...default_category_heading_styles },
  };
}

export function get_menu_store(): menu_store {
  if (typeof window === 'undefined') return get_default_store();
  const raw = localStorage.getItem(storage_key);
  if (!raw) {
    const seed = get_default_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as menu_store;
    if (!parsed.version || parsed.version < store_version) {
      const defaults = get_default_store();
      const merged: menu_store = {
        ...defaults,
        ...parsed,
        version: store_version,
        categories: parsed.categories?.length ? parsed.categories : defaults.categories,
        items: merge_default_badges(parsed.items?.length ? parsed.items : defaults.items),
        removed_item_ids: parsed.removed_item_ids ?? [],
        category_heading_styles: {
          ...defaults.category_heading_styles,
          ...(parsed.category_heading_styles ?? {}),
        },
      };
      localStorage.setItem(storage_key, JSON.stringify(merged));
      return repair_menu_store(merged);
    }
    return repair_menu_store(parsed);
  } catch {
    const seed = get_default_store();
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function save_menu_store(store: menu_store) {
  const next = { ...store, version: store_version };
  localStorage.setItem(storage_key, JSON.stringify(next));
  emit_update();
  schedule_publish(next);
}

export function reset_menu_store() {
  save_menu_store(get_default_store());
}

export function subscribe_menu_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}

export function add_category(name: string) {
  const store = get_menu_store();
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || store.categories.includes(trimmed)) return;
  store.categories.push(trimmed);
  save_menu_store(store);
}

export function rename_category(old_name: string, new_name: string) {
  const store = get_menu_store();
  const trimmed = new_name.trim().toLowerCase();
  if (!trimmed || trimmed === old_name) return;
  store.categories = store.categories.map((c) => (c === old_name ? trimmed : c));
  store.items = store.items.map((i) => rename_item_category(i, old_name, trimmed));
  const styles = { ...(store.category_heading_styles ?? {}) };
  const prev_style =
    styles[old_name] ?? default_category_heading_styles[old_name] ?? undefined;
  if (prev_style) {
    styles[trimmed] = prev_style;
    delete styles[old_name];
    store.category_heading_styles = styles;
  }
  save_menu_store(store);
}

export function delete_category(name: string) {
  const store = get_menu_store();
  store.categories = store.categories.filter((c) => c !== name);
  store.items = store.items.flatMap((i) => {
    const next = drop_item_category(i, name);
    return next ? [next] : [];
  });
  if (store.category_heading_styles?.[name]) {
    const styles = { ...store.category_heading_styles };
    delete styles[name];
    store.category_heading_styles = styles;
  }
  save_menu_store(store);
}

export function set_category_heading_style(category: string, style: heading_style) {
  const store = get_menu_store();
  store.category_heading_styles = {
    ...(store.category_heading_styles ?? {}),
    [category]: style,
  };
  save_menu_store(store);
}

export function get_category_heading_style(category: string): heading_style {
  if (published_heading_styles?.[category]) return published_heading_styles[category];
  const store = typeof window === 'undefined' ? get_default_store() : get_menu_store();
  return (
    store.category_heading_styles?.[category] ??
    default_category_heading_styles[category] ??
    'soft'
  );
}

export function move_category(name: string, dir: -1 | 1) {
  const store = get_menu_store();
  const idx = store.categories.indexOf(name);
  const next = idx + dir;
  if (idx < 0 || next < 0 || next >= store.categories.length) return;
  const cats = [...store.categories];
  [cats[idx], cats[next]] = [cats[next], cats[idx]];
  store.categories = cats;
  save_menu_store(store);
}

export function upsert_menu_item(data: menu_item) {
  const store = get_menu_store();
  const next = set_item_categories(data, item_categories(data));
  const idx = store.items.findIndex((i) => i.id === next.id);
  if (idx >= 0) store.items[idx] = next;
  else store.items.push(next);
  for (const cat of item_categories(next)) {
    if (!store.categories.includes(cat)) store.categories.push(cat);
  }
  save_menu_store(store);
}

export function delete_menu_item(id: string) {
  const store = get_menu_store();
  store.items = store.items.filter((i) => i.id !== id);
  const removed = new Set(store.removed_item_ids ?? []);
  removed.add(id);
  store.removed_item_ids = [...removed];
  save_menu_store(store);
}

export function new_item_id() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
