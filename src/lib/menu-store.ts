import type { menu_item } from '@/lib/types';

export const store_version = 7;

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

const local = (name: string) => `/images/menu/${name}.svg`;

const img = {
  bt1: local('bt1'),
  bt2: local('bt2'),
  bt3: local('bt3'),
  bt4: local('bt4'),
  bt5: local('bt2'),
  bt6: local('bt3'),
  matcha1: local('matcha1'),
  matcha2: local('matcha2'),
  frappe1: local('frappe1'),
  healthy1: local('healthy1'),
  healthy2: local('healthy1'),
  spark1: local('spark1'),
  spark2: local('spark2'),
  snack1: local('snack1'),
  snack2: local('snack2'),
  dessert1: local('dessert1'),
  dessert2: local('dessert2'),
  combo1: local('combo1'),
};

const placeholder_pool = Object.values(img);

function placeholder_for_id(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % placeholder_pool.length;
  return placeholder_pool[hash] ?? img.bt1;
}

function resolve_image_url(item: menu_item, fallback?: menu_item): string | null {
  const url = item.image_url;
  if (url) {
    if (
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('/images/menu/')
    ) {
      return url;
    }
  }
  return fallback?.image_url ?? placeholder_for_id(item.id);
}

function item(
  id: string,
  name: string,
  price: number,
  category: string,
  image_url: string,
  recommendations: string[] = []
): menu_item {
  return { id, name, price, category, image_url, is_available: true, recommendations };
}

export const default_menu_items: menu_item[] = [
  item('bt-1', 'классик молочный', 290, 'классические бабл ти', img.bt1, ['bt-2']),
  item('bt-2', 'таро с молоком', 310, 'классические бабл ти', img.bt2),
  item('bt-3', 'чёрный сахар', 330, 'классические бабл ти', img.bt3),
  item('bt-4', 'oolong молочный', 300, 'классические бабл ти', img.bt2),
  item('bt-5', 'jasmine green', 295, 'классические бабл ти', img.bt1),
  item('bt-6', 'кокос классик', 320, 'классические бабл ти', img.bt3),
  item('bt-7', 'малина молочная', 340, 'классические бабл ти', img.bt4),
  item('jb-1', 'манго джусбол', 350, 'с джусболами', img.bt4, ['jb-2']),
  item('jb-2', 'личи джусбол', 350, 'с джусболами', img.bt5),
  item('jb-3', 'клубника джусбол', 360, 'с джусболами', img.bt6),
  item('jb-4', 'passion fruit', 370, 'с джусболами', img.bt4),
  item('jb-5', 'blueberry pop', 360, 'с джусболами', img.bt5),
  item('jb-6', 'персик джусбол', 355, 'с джусболами', img.bt6),
  item('mt-1', 'матча латте', 320, 'матча', img.matcha1, ['mt-2']),
  item('mt-2', 'матча бабл ти', 340, 'матча', img.matcha2),
  item('mt-3', 'матча frappe lite', 330, 'матча', img.matcha1),
  item('mt-4', 'матча кокос', 345, 'матча', img.matcha2),
  item('mt-5', 'ice matcha', 335, 'матча', img.matcha1),
  item('mt-6', 'матча oreo', 360, 'матча', img.matcha2),
  item('pp-1', 'протеин бабл', 280, 'пп', img.healthy1),
  item('pp-2', 'смузи зелёный', 270, 'пп', img.healthy2),
  item('pp-3', 'лайт манго', 260, 'пп', img.healthy1),
  item('pp-4', 'огуречный fresh', 255, 'пп', img.healthy2),
  item('pp-5', 'berry protein', 285, 'пп', img.healthy1),
  item('fr-1', 'карамель фраппе', 360, 'фраппе', img.frappe1, ['fr-2']),
  item('fr-2', 'шоколад фраппе', 370, 'фраппе', img.frappe1),
  item('fr-3', 'ваниль фраппе', 350, 'фраппе', img.frappe1),
  item('fr-4', 'матча фраппе', 365, 'фраппе', img.frappe1),
  item('fr-5', 'cookies фраппе', 375, 'фраппе', img.frappe1),
  item('gb-1', 'лимон газированный', 300, 'газированные бабл ти', img.spark1),
  item('gb-2', 'грейпфрут spark', 310, 'газированные бабл ти', img.spark2),
  item('gb-3', 'yuzu spark', 320, 'газированные бабл ти', img.spark1),
  item('gb-4', 'cola bubble', 305, 'газированные бабл ти', img.spark2),
  item('gb-5', 'виноград spark', 315, 'газированные бабл ти', img.spark1),
  item('tn-1', 'бабл тоник бузина', 290, 'бабл тоники', img.spark2),
  item('tn-2', 'бабл тоник лайм', 280, 'бабл тоники', img.spark1),
  item('tn-3', 'имбирный тоник', 295, 'бабл тоники', img.spark2),
  item('tn-4', 'тоник маракуйя', 300, 'бабл тоники', img.spark1),
  item('sn-1', 'круассан', 180, 'закуски', img.snack1),
  item('sn-2', 'сырная палочка', 160, 'закуски', img.snack2),
  item('sn-3', 'эдамame', 150, 'закуски', img.snack2),
  item('sn-4', 'онигири', 170, 'закуски', img.snack1),
  item('sn-5', 'matcha chips', 140, 'закуски', img.snack2),
  item('sn-6', 'mochi sticks', 155, 'закуски', img.snack1),
  item('ds-1', 'тирамису', 320, 'десерты', img.dessert1),
  item('ds-2', 'чизкейк', 340, 'десерты', img.dessert2),
  item('ds-3', 'mochi trio', 290, 'десерты', img.dessert1),
  item('ds-4', 'brownie', 310, 'десерты', img.dessert2),
  item('ds-5', 'macaron box', 350, 'десерты', img.dessert1),
  item('ds-6', 'panna cotta', 300, 'десерты', img.dessert2),
  item('cb-1', 'бабл + круассан', 420, 'комбо', img.combo1, ['cb-2']),
  item('cb-2', 'матча + десерт', 580, 'комбо', img.matcha2),
  item('cb-3', 'двойной бабл', 520, 'комбо', img.bt4),
  item('cb-4', 'triple bubble', 650, 'комбо', img.combo1),
  item('cb-5', 'семейный сет', 890, 'комбо', img.combo1),
];

export type menu_store = {
  version: number;
  categories: string[];
  items: menu_item[];
  removed_item_ids?: string[];
};

const storage_key = 'yoboba_menu_store';
const update_event = 'yoboba-menu-update';

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

function repair_menu_store(store: menu_store): menu_store {
  const defaults = get_default_store();
  const removed = new Set(store.removed_item_ids ?? []);
  const categories =
    store.categories?.length > 0 ? store.categories : defaults.categories;
  const default_by_id = new Map(defaults.items.map((i) => [i.id, i]));
  const existing_ids = new Set((store.items ?? []).map((i) => i.id));
  const items = (store.items ?? []).map((item) => {
    const fallback = default_by_id.get(item.id);
    const category = categories.includes(item.category)
      ? item.category
      : fallback?.category ?? categories[0];
    const image_url = resolve_image_url(item, fallback);
    return { ...item, category, image_url };
  });
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
      const merged: menu_store = {
        ...get_default_store(),
        ...parsed,
        version: store_version,
        removed_item_ids: parsed.removed_item_ids ?? [],
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
  localStorage.setItem(storage_key, JSON.stringify({ ...store, version: store_version }));
  emit_update();
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
  store.items = store.items.map((i) =>
    i.category === old_name ? { ...i, category: trimmed } : i
  );
  save_menu_store(store);
}

export function delete_category(name: string) {
  const store = get_menu_store();
  store.categories = store.categories.filter((c) => c !== name);
  store.items = store.items.filter((i) => i.category !== name);
  save_menu_store(store);
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
  const idx = store.items.findIndex((i) => i.id === data.id);
  if (idx >= 0) store.items[idx] = data;
  else store.items.push(data);
  if (!store.categories.includes(data.category)) {
    store.categories.push(data.category);
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
