import type {
  menu_combo,
  menu_combo_include,
  menu_item,
  order_combo_component,
  order_item,
} from '@/lib/types';
import { item_categories } from '@/lib/menu-item-categories';

/** fallback для старых id без поля combo */
export const combo_drink_counts: Record<string, number> = {
  'combo-dabl-drop': 2,
  'combo-semeiny': 3,
  'combo-druzhba': 6,
};

export function default_combo(drink_count = 2, volume_ml = 500): menu_combo {
  return {
    drink_count: Math.max(1, Math.round(drink_count)),
    volume_ml: Math.max(1, Math.round(volume_ml)),
    allow_duplicates: true,
    from_categories: [],
    includes: [],
  };
}

export function normalize_combo(raw: menu_combo | null | undefined): menu_combo | null {
  if (!raw || !(Number(raw.drink_count) > 0)) return null;
  const includes: menu_combo_include[] = [];
  const seen = new Set<string>();
  for (const row of raw.includes ?? []) {
    const menu_id = String(row?.menu_id || '').trim();
    const qty = Math.max(0, Math.round(Number(row?.qty) || 0));
    if (!menu_id || qty <= 0 || seen.has(menu_id)) continue;
    seen.add(menu_id);
    includes.push({ menu_id, qty });
  }
  const from_categories = [...new Set((raw.from_categories ?? []).map((c) => c.trim()).filter(Boolean))];
  return {
    drink_count: Math.max(1, Math.round(Number(raw.drink_count) || 1)),
    volume_ml: Math.max(1, Math.round(Number(raw.volume_ml) || 500)),
    allow_duplicates: raw.allow_duplicates !== false,
    ...(from_categories.length ? { from_categories } : {}),
    ...(includes.length ? { includes } : {}),
  };
}

export function get_combo_config(item: menu_item | null | undefined): menu_combo | null {
  if (!item) return null;
  const from_field = normalize_combo(item.combo);
  if (from_field) return from_field;
  const n = combo_drink_counts[item.id];
  if (typeof n === 'number' && n > 0) return default_combo(n, 500);
  if (item.category === 'комбо' || item_categories(item).includes('комбо')) {
    return default_combo(2, 500);
  }
  return null;
}

export function get_combo_drink_count(item: menu_item | null | undefined): number | null {
  const cfg = get_combo_config(item);
  return cfg ? cfg.drink_count : null;
}

export function is_combo_item(item: menu_item | null | undefined): boolean {
  return get_combo_config(item) != null;
}

function drink_word(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'напиток';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'напитка';
  return 'напитков';
}

export function combo_composition_text(
  cfg: menu_combo,
  catalog: menu_item[] = []
): string {
  const by_id = new Map(catalog.map((m) => [m.id, m]));
  const bits = [`${cfg.drink_count} ${drink_word(cfg.drink_count)} ${cfg.volume_ml} мл на выбор`];
  for (const row of cfg.includes ?? []) {
    const name = by_id.get(row.menu_id)?.name || row.menu_id;
    bits.push(row.qty > 1 ? `${name} ×${row.qty}` : name);
  }
  return bits.join(' · ');
}

/** напитки, которые можно положить в комбо (не сами комбо) */
export function combo_selectable_drinks(
  items: menu_item[],
  combo?: menu_item | null
): menu_item[] {
  const cfg = get_combo_config(combo ?? null);
  const cats = cfg?.from_categories ?? [];
  return items.filter((m) => {
    if (!m.is_available || m.archived === true) return false;
    if (m.category === 'комбо' || item_categories(m).includes('комбо')) return false;
    if (m.id.startsWith('topping-') || m.id.startsWith('addon-')) return false;
    if (get_combo_config(m)) return false;
    if (cats.length) {
      return cats.some((c) => item_categories(m).includes(c));
    }
    return m.category !== 'закуски' && m.category !== 'добавки';
  });
}

export function format_combo_picks(picks: string[]): string {
  if (!picks.length) return '';
  const counts = new Map<string, number>();
  for (const name of picks) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ');
}

/** разложить выбор гостя/кассира + фиксированные includes в компоненты склада */
export function build_combo_components(
  combo: menu_item,
  drink_picks: menu_item[],
  catalog: menu_item[] = []
): order_combo_component[] {
  const cfg = get_combo_config(combo);
  if (!cfg) return [];
  const vol = String(cfg.volume_ml);
  const out: order_combo_component[] = drink_picks.map((p) => ({
    menu_id: p.id,
    name: p.name,
    volume: vol,
    quantity: 1,
  }));
  const by_id = new Map(catalog.map((m) => [m.id, m]));
  for (const row of cfg.includes ?? []) {
    const item = by_id.get(row.menu_id);
    if (!item) continue;
    out.push({
      menu_id: item.id,
      name: item.name,
      quantity: Math.max(1, row.qty),
    });
  }
  return out;
}

type stock_like = Pick<order_item, 'menu_id' | 'name' | 'price' | 'quantity' | 'volume' | 'kind' | 'combo_components'>;

/** безопасный разбор combo_picks / combo_components из тела запроса */
export function parse_combo_order_fields(raw: unknown): {
  combo_picks?: string[];
  combo_components?: order_combo_component[];
} {
  if (!raw || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const picks_raw = rec.combo_picks;
  const combo_picks = Array.isArray(picks_raw)
    ? picks_raw
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.trim().slice(0, 80))
        .slice(0, 20)
    : undefined;
  const comps_raw = rec.combo_components;
  const combo_components = Array.isArray(comps_raw)
    ? comps_raw
        .map((c): order_combo_component | null => {
          if (!c || typeof c !== 'object') return null;
          const row = c as Record<string, unknown>;
          const menu_id = typeof row.menu_id === 'string' ? row.menu_id.trim() : '';
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          if (!menu_id || !name) return null;
          const volume =
            typeof row.volume === 'string' && /^\d+$/.test(row.volume) ? row.volume : undefined;
          const qty = Math.max(1, Math.round(Number(row.quantity) || 1));
          return {
            menu_id: menu_id.slice(0, 80),
            name: name.slice(0, 80),
            ...(volume ? { volume } : {}),
            quantity: qty,
          };
        })
        .filter((c): c is order_combo_component => Boolean(c))
        .slice(0, 30)
    : undefined;
  return {
    ...(combo_picks?.length ? { combo_picks } : {}),
    ...(combo_components?.length ? { combo_components } : {}),
  };
}

/** комбо → напитки/закуски для списания склада; выручка остаётся на строке комбо */
export function expand_items_for_stock<T extends stock_like>(items: T[], menu: menu_item[]): T[] {
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  const out: T[] = [];
  for (const item of items) {
    const components = item.combo_components?.length ? item.combo_components : null;
    if (components?.length) {
      for (const c of components) {
        out.push({
          ...item,
          menu_id: c.menu_id,
          name: c.name,
          price: 0,
          quantity: Math.max(1, c.quantity ?? 1) * Math.max(1, item.quantity),
          volume: c.volume,
          combo_components: undefined,
        });
      }
      continue;
    }
    if (get_combo_config(menu_by_id.get(item.menu_id))) {
      // комбо без разложения — склада по оболочке нет
      continue;
    }
    out.push(item);
  }
  return out;
}

function is_non_drink_item(item: menu_item | null | undefined): boolean {
  if (!item) return false;
  if (item.id.startsWith('topping-') || item.id.startsWith('addon-')) return true;
  const cats = item_categories(item);
  if (cats.includes('добавки') || cats.includes('закуски')) return true;
  if (item.category === 'добавки' || item.category === 'закуски') return true;
  return false;
}

/**
 * Сколько стаканов (напитков) в позициях заказа.
 * Комбо: по combo_components (только напитки) или drink_count из конфига × quantity.
 */
export function count_order_cups(
  items: Array<{
    menu_id?: string;
    name?: string;
    quantity?: number;
    kind?: string;
    combo_components?: order_combo_component[];
    combo_picks?: string[];
  }>,
  menu: menu_item[]
): number {
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  let cups = 0;
  for (const raw of items ?? []) {
    if ((raw.kind || '') === 'staff') continue;
    const line_qty = Math.max(0, Math.round(Number(raw.quantity) || 0));
    if (line_qty <= 0) continue;

    const components = raw.combo_components?.length ? raw.combo_components : null;
    if (components?.length) {
      let drink_in_combo = 0;
      for (const c of components) {
        const m = menu_by_id.get(c.menu_id);
        if (is_non_drink_item(m)) continue;
        // закуски в includes без volume — тоже отсекаем по категории; volume = напиток
        if (m && (m.category === 'закуски' || item_categories(m).includes('закуски'))) continue;
        drink_in_combo += Math.max(1, Math.round(Number(c.quantity) || 1));
      }
      if (drink_in_combo > 0) {
        cups += line_qty * drink_in_combo;
        continue;
      }
      // компоненты только закуски — стаканов 0
      continue;
    }

    const item = raw.menu_id ? menu_by_id.get(raw.menu_id) : undefined;
    const combo_n = get_combo_drink_count(item ?? null);
    if (combo_n != null) {
      // нет разложения: берём заявленное число напитков в комбо
      // если есть combo_picks — точнее по числу выбранных имён
      const picks = Array.isArray(raw.combo_picks) ? raw.combo_picks.filter(Boolean).length : 0;
      cups += line_qty * Math.max(combo_n, picks || 0);
      continue;
    }
    if (is_non_drink_item(item)) continue;
    cups += line_qty;
  }
  return cups;
}
