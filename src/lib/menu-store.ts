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

export const store_version = 22;

export const default_categories = [
  'классика',
  'матча & таро',
  'лимонады',
  'на фруктовом пюре',
  'молочные',
  'напиток месяца',
  'комбо',
];

const local = (name: string) => `/images/menu/${name}.png`;

function vols(base: number, large: number) {
  return [
    { ml: 500, add: 0 },
    { ml: 650, add: Math.max(0, large - base) },
  ];
}

function item(
  id: string,
  name: string,
  price: number,
  category: string,
  image_url: string,
  extras?: Partial<menu_item> & {
    badge?: { text: string; color?: menu_badge_color };
    recommendations?: string[];
  }
): menu_item {
  const { badge, recommendations = [], ...rest } = extras ?? {};
  const is_combo = category === 'комбо';
  return {
    id,
    name,
    price,
    category,
    image_url,
    is_available: true,
    recommendations,
    prep_minutes: DEFAULT_PREP_MINUTES,
    volumes: is_combo ? undefined : vols(price, price + 50),
    has_volumes: is_combo ? false : true,
    has_toppings: is_combo ? false : true,
    cold: is_combo ? false : true,
    hot: false,
    ...(badge ? { badge_text: badge.text, badge_color: 'orange' as const } : {}),
    ...rest,
  };
}

export const default_menu_items: menu_item[] = [
  item('original-black', 'чёрный сахар', 390, 'классика', local('original-black'), {
    composition: 'чёрный чай, молоко, тапиока, сироп «чёрный сахар» (лёд)',
    volumes: vols(390, 450),
    cold: true,
    hot: true,
    recommendations: ['jasmine-green'],
  }),
  item('jasmine-green', 'зелёный жасмин', 390, 'классика', local('jasmine-green'), {
    composition: 'зелёный чай с жасмином, молоко, тапиока, сироп «чёрный сахар» (лёд)',
    volumes: vols(390, 450),
    cold: true,
    hot: true,
    recommendations: ['original-black'],
  }),
  item('matcha-latte-tiger', 'матча латте', 450, 'матча & таро', local('matcha-latte-tiger'), {
    composition:
      'молоко, натуральный порошок матчи, вода, сырная шапка, тапиока, сироп «чёрный сахар» (лёд)',
    volumes: vols(450, 520),
    cold: true,
    hot: true,
    recommendations: ['taro'],
  }),
  item('taro', 'таро', 450, 'матча & таро', local('taro'), {
    composition: 'сухая смесь «таро», вода, сырная шапка, тапиока (лёд)',
    volumes: vols(450, 520),
    cold: true,
    hot: true,
    recommendations: ['matcha-latte-tiger'],
  }),
  item('klubnichny-limonad', 'клубничный лимонад', 319, 'лимонады', local('klubnichny-limonad'), {
    composition: 'газированная вода, концентрат клубники, джус-боллы с соком клубники, лёд',
    volumes: vols(319, 390),
    cold: true,
    hot: false,
    recommendations: ['tropichesky-limonad'],
  }),
  item('tropichesky-limonad', 'тропический фьюжн', 299, 'лимонады', local('tropichesky-limonad'), {
    composition:
      'газированная вода, сироп «блю кюрасао», джус-боллы с соком маракуйи, желе «личи», лёд',
    volumes: vols(299, 410),
    cold: true,
    hot: false,
    recommendations: ['klubnichny-limonad'],
  }),
  item('klubnika-mango', 'клубника манго', 390, 'на фруктовом пюре', local('klubnika-mango'), {
    composition: 'клубника, вода, тростниковый сахар, молоко, джус-боллы с соком манго, лёд',
    volumes: vols(390, 470),
    cold: true,
    hot: false,
    recommendations: [],
  }),
  item('nezhnaya-roza', 'нежная роза', 420, 'молочные', local('nezhnaya-roza'), {
    composition: 'молоко, концентрат клубники, джус-боллы с соком клубники, розовая вода, лёд',
    volumes: vols(420, 480),
    cold: true,
    hot: false,
    recommendations: ['golubaya-laguna'],
  }),
  item('golubaya-laguna', 'голубая лагуна', 420, 'молочные', local('golubaya-laguna'), {
    composition: 'молоко, сироп «блю кюрасао», джус-боллы с соком манго, лёд',
    volumes: vols(420, 480),
    cold: true,
    hot: false,
    recommendations: ['nezhnaya-roza'],
  }),
  item('subzero', 'сабзиро', 490, 'напиток месяца', local('subzero'), {
    composition:
      'газированная вода, джус-боллы йогурт, сироп «блю кюрасао», много льда, снег, экстракт ментола',
    volumes: [{ ml: 650, add: 0 }],
    cold: true,
    hot: false,
    recommendations: [],
    badge: { text: 'месяца' },
  }),
  item('combo-dabl-drop', 'двойной', 719, 'комбо', local('combo-dabl-drop'), {
    composition: 'два любимых напитка 500 мл на выбор',
    recommendations: ['combo-semeiny', 'combo-druzhba'],
  }),
  item('combo-semeiny', 'семейный', 1050, 'комбо', local('combo-semeiny'), {
    composition: 'три любимых напитка 500 мл на выбор',
    recommendations: ['combo-dabl-drop', 'combo-druzhba'],
  }),
  item('combo-druzhba', 'дружба', 1990, 'комбо', local('combo-druzhba'), {
    composition: 'шесть напитков 500 мл на дружную компанию',
    recommendations: ['combo-dabl-drop', 'combo-semeiny'],
  }),
];

const placeholder_pool = default_menu_items
  .map((i) => i.image_url)
  .filter((url): url is string => Boolean(url));

function placeholder_for_id(id: string) {
  if (!placeholder_pool.length) return local('original-black');
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % placeholder_pool.length;
  return placeholder_pool[hash] ?? local('original-black');
}

function normalize_item_name(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function find_default_item(item: menu_item, by_id: Map<string, menu_item>, by_name: Map<string, menu_item>) {
  return by_id.get(item.id) ?? by_name.get(normalize_item_name(item.name));
}

const known_menu_bases = new Set(
  default_menu_items.map((i) => {
    const url = (i.image_url || '').trim();
    if (!url.startsWith('/images/menu/')) return '';
    return url.slice('/images/menu/'.length).replace(/\.[^.]+$/, '').replace(/\?.*$/, '');
  }).filter(Boolean)
);

function is_stale_menu_placeholder(url: string) {
  if (!url.startsWith('/images/menu/')) return false;
  if (url.endsWith('.svg')) return true;
  const base = url
    .slice('/images/menu/'.length)
    .replace(/\?.*$/, '')
    .replace(/\.[^.]+$/, '');
  return !known_menu_bases.has(base);
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
  return merge_menu_item_catalog(items).map((item) => ({
    ...item,
    image_url: resolve_image_url(
      item,
      find_default_item(item, get_default_lookups().by_id, get_default_lookups().by_name)
    ),
  }));
}

/** цены, объёмы и флаги карточки — из актуального меню в коде */
export function merge_menu_item_catalog(items: menu_item[]): menu_item[] {
  const { by_id, by_name } = get_default_lookups();
  return items.map((item) => {
    const fallback = find_default_item(item, by_id, by_name);
    if (!fallback) return item;
    return {
      ...item,
      price: fallback.price,
      volumes: fallback.volumes,
      has_volumes: fallback.has_volumes,
      has_toppings: fallback.has_toppings,
      cold: fallback.cold,
      hot: fallback.hot,
    };
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
    merge_menu_item_catalog(
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
    )
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
      // v19: полное меню из YoDesigner — старые позиции не мержим
      const defaults = get_default_store();
      localStorage.setItem(storage_key, JSON.stringify(defaults));
      return defaults;
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
