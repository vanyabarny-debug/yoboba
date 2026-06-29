import type { menu_item } from '@/lib/types';
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

export function get_composition(item: menu_item): string[] {
  const store = get_site_content_store();
  const raw = store.category_compositions[item.category];
  const base = raw ? parse_composition(raw) : ['основа', 'тапиока', 'лёд'];
  return [...base, item.name.toLowerCase()];
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

export type nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carb: number;
};

const topping_portion_nutrition: nutrition = { kcal: 52, protein: 0.2, fat: 0.1, carb: 12.5 };

export function get_topping_portion_price_value(): number {
  return get_topping_portion_price();
}

/** @deprecated use get_topping_portion_price_value() */
export const topping_portion_price = 60;

const category_topping: Record<string, string> = {
  'классические бабл ти': 'тапиока',
  'с джусболами': 'джусболы',
  матча: 'тапиока',
  пп: 'желе',
  фраппе: 'тапиока',
  'газированные бабл ти': 'джусболы',
  'бабл тоники': 'желе',
  закуски: 'тапиока',
  десерты: 'тапиока',
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
  const base = get_category_nutrition(item.category);
  const scale = volume_ml / 100;
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
