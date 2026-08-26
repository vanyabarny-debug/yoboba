import type { menu_item, menu_nutrition, menu_volume } from '@/lib/types';
import { item_has_volumes } from '@/lib/cart-summary';
import {
  default_addons,
  get_category_nutrition,
  get_site_content_store,
  get_topping_portion_price,
  parse_composition,
  type product_addon,
} from '@/lib/site-content-store';

export type { product_addon };

export { default_addons };

export function get_addons(): product_addon[] {
  if (typeof window === 'undefined') return default_addons;
  return get_site_content_store().addons;
}

export const default_drink_volumes: menu_volume[] = [
  { ml: 500, add: 0 },
  { ml: 650, add: 50 },
];

export function normalize_volumes(list: menu_volume[] | undefined): menu_volume[] {
  const seen = new Set<number>();
  const out: menu_volume[] = [];
  for (const row of list ?? []) {
    const ml = Math.round(Number(row.ml) || 0);
    if (ml <= 0 || seen.has(ml)) continue;
    seen.add(ml);
    out.push({ ml, add: Math.max(0, Math.round(Number(row.add) || 0)) });
  }
  return out.sort((a, b) => a.ml - b.ml);
}

export function get_item_volumes(item: menu_item): menu_volume[] {
  if (!item_has_volumes(item)) return [];
  const custom = normalize_volumes(item.volumes);
  return custom.length > 0 ? custom : default_drink_volumes;
}

export function first_volume_id(item?: menu_item | null): string {
  const vols = item ? get_item_volumes(item) : default_drink_volumes;
  return vols[0] ? String(vols[0].ml) : '500';
}

export function resolve_volume_id(item: menu_item, volume?: string | null): string | undefined {
  if (!item_has_volumes(item)) return undefined;
  const vols = get_item_volumes(item);
  if (volume && vols.some((v) => String(v.ml) === volume)) return volume;
  return vols[0] ? String(vols[0].ml) : undefined;
}

export function get_volume_add(item: menu_item, volume?: string | null): number {
  const id = resolve_volume_id(item, volume);
  if (!id) return 0;
  return get_item_volumes(item).find((v) => String(v.ml) === id)?.add ?? 0;
}

export function configured_unit_price(
  item: menu_item,
  volume?: string | null,
  topping = 0
): number {
  return Math.max(
    0,
    item.price + get_volume_add(item, volume) + topping * get_topping_portion_price()
  );
}

export function get_composition_text(item: menu_item): string {
  if (item.composition?.trim()) return item.composition.trim();
  const store = get_site_content_store();
  return store.category_compositions[item.category] ?? '';
}

export function get_composition(item: menu_item): string[] {
  const raw = get_composition_text(item);
  if (raw) return parse_composition(raw);
  return ['основа', 'тапиока', 'лёд', item.name.toLowerCase()];
}

export function get_description(item: menu_item): string {
  const store = get_site_content_store();
  return (
    store.category_descriptions[item.category] ??
    'готовим после заказа — можно настроить объём, лёд и добавки.'
  );
}

export function addon_as_menu_item(addon: product_addon): menu_item {
  return {
    id: `addon-${addon.id}`,
    name: addon.name,
    price: addon.price,
    image_url: null,
    category: 'добавки',
    is_available: true,
    recommendations: [],
  };
}

export type nutrition = menu_nutrition;

const topping_portion_nutrition: nutrition = { kcal: 52, protein: 0.2, fat: 0.1, carb: 12.5 };

export function get_item_nutrition_base(item: menu_item): nutrition {
  if (item.nutrition) {
    return {
      kcal: Math.max(0, Number(item.nutrition.kcal) || 0),
      protein: Math.max(0, Number(item.nutrition.protein) || 0),
      fat: Math.max(0, Number(item.nutrition.fat) || 0),
      carb: Math.max(0, Number(item.nutrition.carb) || 0),
    };
  }
  return get_category_nutrition(item.category);
}

export function get_topping_portion_price_value(): number {
  return get_topping_portion_price();
}

/** @deprecated use get_topping_portion_price_value() */
export const topping_portion_price = 60;

const category_topping: Record<string, string> = {
  классика: 'тапиока',
  'матча & таро': 'тапиока',
  молочные: 'джус-боллы',
  лимонады: 'джус-боллы',
  'на фруктовом пюре': 'джус-боллы',
  'напиток месяца': 'джус-боллы',
  комбо: 'тапиока',
};

export function get_topping_name(item: menu_item): string {
  return category_topping[item.category] ?? 'тапиока';
}

export function get_nutrition(
  item: menu_item,
  volume_ml: number,
  topping_portions = 0
): nutrition {
  const base = get_item_nutrition_base(item);
  const scale = item_has_volumes(item) ? Math.max(1, volume_ml) / 100 : 1;
  const kcal = base.kcal * scale + topping_portion_nutrition.kcal * topping_portions;
  const protein =
    base.protein * scale + topping_portion_nutrition.protein * topping_portions;
  const fat = base.fat * scale + topping_portion_nutrition.fat * topping_portions;
  const carb = base.carb * scale + topping_portion_nutrition.carb * topping_portions;
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carb: Math.round(carb * 10) / 10,
  };
}

export function topping_as_menu_item(item: menu_item): menu_item {
  const name = get_topping_name(item);
  return {
    id: `topping-${item.category}-${name}`,
    name: `доп. ${name}`,
    price: get_topping_portion_price(),
    image_url: null,
    category: 'добавки',
    is_available: true,
    recommendations: [],
  };
}
