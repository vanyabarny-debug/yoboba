import { item_categories } from '@/lib/menu-item-categories';
import type { menu_item } from '@/lib/types';

type menu_source = {
  categories?: string[];
  items?: menu_item[];
};

export const MENU_SITE = 'https://yomoyo.su';
export const MENU_TOPPING = 'топпинг ×2 — 60 ₽';
export const MENU_PAD_L = 64;
export const MENU_PAD_R = 48;
export const MENU_PAD_T = 56;
export const MENU_QR = 96;
export const MENU_FOOTER = 140;
export const MENU_COL_GAP = 28;

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
  left: menu_group[];
  right: menu_group[];
  qr: string;
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
      next.push(merge_group(group, live, seen));
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

function merge_group(saved: saved_group, site: menu_group, seen: Set<string>): menu_group {
  const saved_items = saved.items ?? [];
  const by_id = new Map(saved_items.map((item) => [item.id || '', item]));
  const kept = site.items
    .filter((item) => (seen.has(item.id) ? saved_items.some((saved_item) => saved_item.id === item.id) : true))
    .map((item) => {
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
