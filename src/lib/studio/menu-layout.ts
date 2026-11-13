import { item_categories } from '@/lib/menu-item-categories';
import type { menu_item } from '@/lib/types';

type menu_source = {
  categories?: string[];
  items?: menu_item[];
};

export const MENU_SITE = 'https://yomoyo.su';
export const MENU_TOOLS_ID = 'menu-sheet-tools';
export const MENU_PAD_L = 64;
export const MENU_PAD_R = 48;
export const MENU_PAD_T = 56;
export const MENU_PAD_B = 56;
export const MENU_COL_GAP = 28;
export const MENU_BLOCK_GAP = 32;
export const MENU_HEAD_GAP = 20;
export const MENU_GAP_MAX = 160;
export const MENU_SCALE_MIN = 50;
export const MENU_SCALE_MAX = 200;
export const MENU_TITLE_SIZE = Math.round(36 * 1.4);

export const MENU_LOGO = { h: 120, size: 104 };
export const MENU_CARD = { pad: 28, radius: 28, title: 30, border: 3 };
export const MENU_SUGAR = { levels: [0, 50, 100, 150], h: 244, dot: 60, label: 22, extra: 20 };
export const MENU_EXTRA = { h: 156, price_size: 64, note_size: 22 };
export const MENU_NOTE = { h: 156, qr: 156, title_size: 32, body_size: 24, site_size: 20 };
export const MENU_WIFI = { h: 156, icon: 84, note_size: 22 };

export const MENU_INK = '#20181B';
export const MENU_MUTED = '#8B8689';
export const MENU_ACCENT = '#FF6B6B';

export const MENU_TEXT_DEFAULTS = {
  logo: 'yomoyo',
  options_title: 'опции',
  sugar_title: 'сладость',
  sugar_0: '0%',
  sugar_50: '50%',
  sugar_100: '100%',
  sugar_150: '150%',
  sugar_150_price: '+10 ₽',
  extra_title: 'топпинг ×2',
  extra_price: '+60 ₽',
  extra_note: 'любой на выбор',
  wifi_title: 'бесплатный wi-fi',
  wifi_note: 'пароль спроси у бариста',
  note_title: 'меню обновляется',
  note_body: 'больше напитков — по QR',
  note_site: 'yomoyo.su',
};

export type menu_text_key = keyof typeof MENU_TEXT_DEFAULTS;
export type menu_texts = Record<menu_text_key, string>;

export function menu_texts(layout: board_layout | null): menu_texts {
  return { ...MENU_TEXT_DEFAULTS, ...(layout?.texts ?? {}) };
}

export function sugar_key(level: number) {
  return `sugar_${level}` as menu_text_key;
}

export type extra_kind = 'logo' | 'options' | 'sugar' | 'extra' | 'wifi' | 'note';
const extra_kinds: extra_kind[] = ['logo', 'options', 'sugar', 'extra', 'wifi', 'note'];

/** плашки, которые растут вместе с «масштабом плашек» */
export function is_plate(kind: menu_block['kind']) {
  return kind === 'sugar' || kind === 'extra' || kind === 'wifi';
}

export type menu_block =
  | { key: string; kind: 'group'; group: menu_group }
  | { key: string; kind: extra_kind };

/** цена большого размера: доплата «+50₽» или итог «520₽» */
export type price2_mode = 'add' | 'full';

export type board_layout = {
  left: string[];
  right: string[];
  items: Record<string, string[]>;
  texts: Partial<menu_texts>;
  hidden: string[];
  moves: Record<string, string>;
  price2: price2_mode;
  /** отступ под заголовком категории и между блоками, px листа до масштаба */
  head_gap: number;
  block_gap: number;
  /** масштаб в процентах от исходного */
  logo_scale: number;
  title_scale: number;
  item_scale: number;
  plate_scale: number;
};

export type menu_scales = Pick<board_layout, 'logo_scale' | 'title_scale' | 'item_scale' | 'plate_scale'>;

export const empty_layout: board_layout = {
  left: [],
  right: [],
  items: {},
  texts: {},
  hidden: [],
  moves: {},
  price2: 'add',
  head_gap: MENU_HEAD_GAP,
  block_gap: MENU_BLOCK_GAP,
  logo_scale: 100,
  title_scale: 100,
  item_scale: 100,
  plate_scale: 100,
};

export type menu_card = {
  id: string;
  name: string;
  siteName: string;
  price: string;
  sitePrice: string;
  price2: string;
  sitePrice2: string;
  weight: string;
  weight2: string;
  desc: string;
  siteDesc: string;
  image: string;
  cold: boolean;
  hot: boolean;
  siteCold: boolean;
  siteHot: boolean;
  limited: boolean;
  combo: boolean;
};

export type menu_group = {
  id: string;
  title: string;
  column: 'left' | 'right';
  accent: boolean;
  items: menu_card[];
};

export type menu_paint = {
  k: number;
  left: menu_block[];
  right: menu_block[];
  qr: string;
  texts: menu_texts;
  head_gap: number;
  block_gap: number;
  scales: menu_scales;
};

type saved_item = Partial<menu_card> & { id?: string; isLimited?: boolean };
type saved_group = {
  id?: string;
  title?: string;
  column?: string;
  isAccent?: boolean;
  items?: saved_item[];
};

export function menu_big(group: menu_group) {
  return group.accent || /напиток\s*месяца/i.test(group.title);
}

export function group_key(id: string) {
  return `g:${id}`;
}

function extra_key(kind: extra_kind) {
  return `x:${kind}`;
}

export function block_label(block: menu_block, texts: menu_texts) {
  if (block.kind === 'group') return block.group.title;
  if (block.kind === 'logo') return 'логотип';
  if (block.kind === 'options') return texts.options_title;
  if (block.kind === 'sugar') return texts.sugar_title;
  if (block.kind === 'extra') return texts.extra_title;
  if (block.kind === 'wifi') return texts.wifi_title;
  return texts.note_title;
}

function move_key(from: string, id: string) {
  return `${from}::${id}`;
}

function split_move(key: string) {
  const at = key.lastIndexOf('::');
  return { from: key.slice(0, at), id: key.slice(at + 2) };
}

export function move_item_local(moves: Record<string, string>, id: string, from: string, to: string) {
  const next = { ...moves };
  const origin = Object.keys(next).find((key) => next[key] === from && split_move(key).id === id);
  if (!origin) {
    next[move_key(from, id)] = to;
    return next;
  }
  delete next[origin];
  const first = split_move(origin).from;
  if (first !== to) next[move_key(first, id)] = to;
  return next;
}

function apply_moves(groups: menu_group[], moves: Record<string, string> | undefined) {
  if (!moves || !Object.keys(moves).length) return groups;
  const by_id = new Map(groups.map((group) => [group.id, { ...group, items: [...group.items] }]));
  for (const [key, to] of Object.entries(moves)) {
    const { from, id } = split_move(key);
    const src = by_id.get(from);
    const dst = by_id.get(to);
    const item = src?.items.find((row) => row.id === id);
    if (!src || !dst || !item) continue;
    src.items = src.items.filter((row) => row.id !== id);
    if (!dst.items.some((row) => row.id === id)) dst.items.push(item);
  }
  return [...by_id.values()].filter((group) => group.items.length);
}

export function arrange(source: menu_group[], layout: board_layout | null) {
  const groups = apply_moves(source, layout?.moves);
  const hidden = new Set(layout?.hidden ?? []);
  const by_key = new Map<string, menu_block>();
  const mode = layout?.price2 ?? 'add';
  for (const group of groups) {
    const key = group_key(group.id);
    by_key.set(key, { key, kind: 'group', group: with_price2(ordered(group, layout?.items[group.id]), mode) });
  }
  for (const kind of extra_kinds) by_key.set(extra_key(kind), { key: extra_key(kind), kind });

  const used = new Set<string>(hidden);
  const take = (keys: string[]) => {
    const out: menu_block[] = [];
    for (const key of keys) {
      const block = by_key.get(key);
      if (!block || used.has(key)) continue;
      used.add(key);
      out.push(block);
    }
    return out;
  };
  const left = take(layout?.left ?? []);
  const right = take(layout?.right ?? []);

  const logo = by_key.get(extra_key('logo'))!;
  if (!used.has(logo.key)) left.unshift(logo);
  for (const group of groups) {
    const key = group_key(group.id);
    if (used.has(key)) continue;
    (group.column === 'right' ? right : left).push(by_key.get(key)!);
  }
  // новые блоки встают перед соседом, если раскладка уже сохранена без них
  const before: Partial<Record<extra_kind, extra_kind>> = { options: 'sugar', wifi: 'note' };
  for (const kind of ['options', 'sugar', 'extra', 'wifi', 'note'] as const) {
    const key = extra_key(kind);
    if (used.has(key)) continue;
    const block = by_key.get(key)!;
    const next = before[kind] ? extra_key(before[kind]) : null;
    const col = next && left.some((b) => b.key === next) ? left : right;
    const at = next ? col.findIndex((b) => b.key === next) : -1;
    if (at === -1) col.push(block);
    else col.splice(at, 0, block);
  }
  const off = [...hidden].flatMap((key) => {
    const block = by_key.get(key);
    return block ? [block] : [];
  });
  return { left, right, hidden: off };
}

function with_price2(group: menu_group, mode: price2_mode): menu_group {
  if (mode === 'add') return group;
  return { ...group, items: group.items.map((item) => ({ ...item, price2: full_price2(item) })) };
}

/** «450₽» + «+70₽» → «520₽»; свою подпись без плюса не трогаем */
function full_price2(item: menu_card) {
  const add = item.price2.trim();
  if (!add.startsWith('+')) return item.price2;
  const base = Number(item.price.replace(/[^\d]/g, ''));
  const extra = Number(add.replace(/[^\d]/g, ''));
  if (!base || !Number.isFinite(extra)) return item.price2;
  return rub(base + extra);
}

function ordered(group: menu_group, order: string[] | undefined): menu_group {
  if (!order?.length) return group;
  const items = group.items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(order, a.item.id) - rank(order, b.item.id) || a.index - b.index)
    .map((row) => row.item);
  return { ...group, items };
}

export function move_block(
  layout: board_layout,
  current: { left: menu_block[]; right: menu_block[] },
  key: string,
  col: 'left' | 'right',
  before: string | null,
): board_layout {
  const left = current.left.map((block) => block.key).filter((k) => k !== key);
  const right = current.right.map((block) => block.key).filter((k) => k !== key);
  const target = col === 'left' ? left : right;
  const at = before ? target.indexOf(before) : -1;
  target.splice(at === -1 ? target.length : at, 0, key);
  return { ...layout, left, right };
}

export function place_item(order: string[], id: string, before: string | null) {
  const next = order.filter((row) => row !== id);
  const at = before ? next.indexOf(before) : -1;
  next.splice(at === -1 ? next.length : at, 0, id);
  return next;
}

export function clean_layout(raw: unknown): board_layout {
  if (!raw || typeof raw !== 'object') return { ...empty_layout };
  const row = raw as Record<string, unknown>;
  const keys = (value: unknown) =>
    Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string').slice(0, 200) : [];
  const items: Record<string, string[]> = {};
  if (row.items && typeof row.items === 'object') {
    for (const [id, order] of Object.entries(row.items as Record<string, unknown>).slice(0, 100)) {
      items[id] = keys(order);
    }
  }
  const texts: Partial<menu_texts> = {};
  if (row.texts && typeof row.texts === 'object') {
    for (const [key, value] of Object.entries(row.texts as Record<string, unknown>)) {
      if (!(key in MENU_TEXT_DEFAULTS) || typeof value !== 'string') continue;
      const text = value.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (text) texts[key as menu_text_key] = text;
    }
  }
  const moves: Record<string, string> = {};
  if (row.moves && typeof row.moves === 'object') {
    for (const [key, to] of Object.entries(row.moves as Record<string, unknown>).slice(0, 300)) {
      if (key.includes('::') && typeof to === 'string' && to) moves[key] = to;
    }
  }
  return {
    left: keys(row.left),
    right: keys(row.right),
    items,
    texts,
    hidden: keys(row.hidden),
    moves,
    price2: row.price2 === 'full' ? 'full' : 'add',
    head_gap: clean_gap(row.head_gap, MENU_HEAD_GAP),
    block_gap: clean_gap(row.block_gap, MENU_BLOCK_GAP),
    logo_scale: clean_scale(row.logo_scale),
    title_scale: clean_scale(row.title_scale),
    item_scale: clean_scale(row.item_scale),
    plate_scale: clean_scale(row.plate_scale),
  };
}

function clean_scale(raw: unknown) {
  const value = Number(raw);
  if (raw == null || !Number.isFinite(value)) return 100;
  return Math.min(MENU_SCALE_MAX, Math.max(MENU_SCALE_MIN, Math.round(value)));
}

function clean_gap(raw: unknown, fallback: number) {
  const value = Number(raw);
  if (raw == null || !Number.isFinite(value)) return fallback;
  return Math.min(MENU_GAP_MAX, Math.max(0, Math.round(value)));
}

export function menu_groups(store: menu_source | null | undefined): menu_group[] {
  const items = (store?.items ?? []).filter((item) => item.is_available !== false);
  const titles = store?.categories?.filter(Boolean) ?? [];
  const groups: menu_group[] = [];
  titles.forEach((title, index) => {
    const rows = items.filter((item) => item_categories(item).includes(title)).map(to_card);
    if (!rows.length) return;
    groups.push({
      id: title,
      title,
      column: index % 2 === 0 ? 'left' : 'right',
      accent: title === 'напиток месяца',
      items: rows,
    });
  });
  return groups;
}

export function merge_menu(saved: unknown, site: menu_group[], seen: Set<string>): menu_group[] {
  const stored = as_groups(saved);
  if (!stored?.length) return site;
  const by_id = new Map(site.map((group) => [group.id, group]));
  const used = new Set<string>();
  const next: menu_group[] = [];
  for (const group of stored) {
    const live = by_id.get(group.id || '');
    if (live && group.id) {
      used.add(group.id);
      next.push(merge_group(group, live));
    } else if (group.id?.startsWith('g')) {
      next.push(saved_only(group));
    }
  }
  for (const group of site) {
    if (!used.has(group.id) && !seen.has(`group:${group.id}`)) next.push(group);
  }
  return next.filter((group) => group.items.length);
}

export function load_seen() {
  try {
    const raw = JSON.parse(localStorage.getItem('yomoyo_menu_seen_v3') || '[]') as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export function load_saved_menu(): Promise<saved_group[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: saved_group[] | null) => {
      if (settled) return;
      settled = true;
      resolve(value?.length ? value : read_local());
    };
    try {
      const request = indexedDB.open('yomoyo_menu', 1);
      request.onerror = () => finish(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('menu_board')) db.createObjectStore('menu_board');
      };
      request.onsuccess = () => {
        try {
          const db = request.result;
          const get = db.transaction('menu_board', 'readonly').objectStore('menu_board').get('groups_v3');
          get.onsuccess = () => finish(Array.isArray(get.result) ? (get.result as saved_group[]) : null);
          get.onerror = () => finish(null);
        } catch {
          finish(null);
        }
      };
    } catch {
      finish(null);
    }
  });
}

function read_local(): saved_group[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem('yomoyo_menu_groups_v3') || 'null') as unknown;
    return Array.isArray(raw) ? (raw as saved_group[]) : null;
  } catch {
    return null;
  }
}

function as_groups(raw: unknown): saved_group[] | null {
  if (!Array.isArray(raw)) return null;
  const groups = raw.filter((group) => group && typeof group === 'object' && typeof (group as saved_group).id === 'string');
  return groups.length ? (groups as saved_group[]) : null;
}

function merge_group(saved: saved_group, site: menu_group): menu_group {
  const saved_items = saved.items ?? [];
  const by_id = new Map(saved_items.map((item) => [item.id || '', item]));
  const kept = site.items.map((item) => {
    const edited = by_id.get(item.id);
    return edited ? apply_edit(item, edited) : item;
  });
  const known = new Set(site.items.map((item) => item.id));
  const custom = saved_items
    .filter((item) => item.id?.startsWith('n') && !known.has(item.id))
    .map((item) => card_from_saved(item));
  const order = saved_items.map((item) => item.id || '');
  const items = [...kept, ...custom].sort((a, b) => rank(order, a.id) - rank(order, b.id));
  const title = saved.title || site.title;
  return {
    ...site,
    title,
    column: saved.column === 'right' ? 'right' : saved.column === 'left' ? 'left' : site.column,
    accent: Boolean(saved.isAccent),
    items,
  };
}

function saved_only(saved: saved_group): menu_group {
  const title = saved.title || 'раздел';
  return {
    id: saved.id || title,
    title,
    column: saved.column === 'right' ? 'right' : 'left',
    accent: Boolean(saved.isAccent),
    items: (saved.items ?? []).map((item) => card_from_saved(item)),
  };
}

function apply_edit(site: menu_card, saved: saved_item): menu_card {
  const price2 = typeof saved.price2 === 'string' && saved.price2.trim().startsWith('+') ? saved.price2 : undefined;
  return {
    ...site,
    name: pick(saved.name, saved.siteName, site.name),
    price: pick(saved.price, saved.sitePrice, site.price),
    price2: pick(price2, saved.sitePrice2, site.price2),
    desc: pick(saved.desc, saved.siteDesc, site.desc),
    image: saved.image?.startsWith('data:') ? saved.image : site.image,
    limited: Boolean(saved.isLimited),
    cold: saved.siteCold === undefined || saved.cold === saved.siteCold ? site.cold : Boolean(saved.cold),
    hot: saved.siteHot === undefined || saved.hot === saved.siteHot ? site.hot : Boolean(saved.hot),
    weight: saved.weight || site.weight,
    weight2: saved.weight2 || site.weight2,
    combo: is_combo(site.id, saved.weight || site.weight, site.combo),
  };
}

function card_from_saved(saved: saved_item): menu_card {
  const weight = saved.weight || '';
  return {
    id: saved.id || `n${Math.random().toString(36).slice(2)}`,
    name: saved.name || '',
    siteName: saved.siteName || saved.name || '',
    price: saved.price || '',
    sitePrice: saved.sitePrice || saved.price || '',
    price2: saved.price2 || '',
    sitePrice2: saved.sitePrice2 || saved.price2 || '',
    weight,
    weight2: saved.weight2 || '',
    desc: saved.desc || '',
    siteDesc: saved.siteDesc || saved.desc || '',
    image: saved.image || '',
    cold: Boolean(saved.cold),
    hot: Boolean(saved.hot),
    siteCold: Boolean(saved.siteCold),
    siteHot: Boolean(saved.siteHot),
    limited: Boolean(saved.isLimited),
    combo: is_combo(saved.id || '', weight, false),
  };
}

function rank(order: string[], id: string) {
  const index = order.indexOf(id);
  return index === -1 ? order.length + 1 : index;
}

function pick(saved: string | undefined, snapshot: string | undefined, site: string) {
  if (saved == null) return site;
  if (snapshot == null) return saved;
  return saved === snapshot ? site : saved;
}

function to_card(item: menu_item): menu_card {
  const combo = item.category === 'комбо' || item.has_volumes === false;
  const volumes = combo ? [] : item.volumes?.length ? item.volumes : [{ ml: 500, add: 0 }, { ml: 650, add: 50 }];
  const first = volumes[0];
  const second = volumes[1];
  const price = rub(item.price + (first?.add || 0));
  const price2 = second ? `+${Math.round(second.add)}₽` : '';
  const weight = combo ? 'набор' : `${first?.ml || 500} мл`;
  const weight2 = second ? `${second.ml} мл` : '';
  const desc = (item.composition || '').trim();
  return {
    id: item.id,
    name: item.name,
    siteName: item.name,
    price,
    sitePrice: price,
    price2,
    sitePrice2: price2,
    weight,
    weight2,
    desc,
    siteDesc: desc,
    image: item.image_url || '',
    cold: Boolean(item.cold),
    hot: Boolean(item.hot),
    siteCold: Boolean(item.cold),
    siteHot: Boolean(item.hot),
    limited: Boolean(item.badge_text),
    combo: is_combo(item.id, weight, combo),
  };
}

function is_combo(id: string, weight: string, combo: boolean) {
  return combo || id === 'c1' || id === 'c2' || id === 'c3' || /набор/i.test(weight);
}

function rub(value: number) {
  return `${Math.round(value)}₽`;
}
