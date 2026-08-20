import type { menu_item } from '@/lib/types';

export function format_price(value: number): string {
  return value.toLocaleString('ru-RU');
}

export function format_positions(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} товаров`;
  if (mod10 === 1) return `${count} товар`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} товара`;
  return `${count} товаров`;
}

export function format_cart_summary(count: number, total: number): string {
  return `${format_positions(count)} на ${format_price(total)} ₽`;
}

/** шариков в средней порции ≈ бобаллов с одного напитка */
export const BOBY_PER_DRINK = 50;

/** 5 напитков → подарок */
export const FREE_DRINK_BONUS_THRESHOLD = 250;

/** короткое обозначение валюты */
export const BOBY_SHORT = 'бб';

export type bonus_line = {
  category?: string | null;
  quantity: number;
  id?: string | null;
  menu_id?: string | null;
};

/** напиток копит бобаллы; закуски, добавки и топпинги — нет */
export function is_boby_earning_item(item: bonus_line): boolean {
  const id = item.id || item.menu_id || '';
  if (id.startsWith('topping-') || id.startsWith('addon-')) return false;
  const cat = (item.category || '').trim().toLowerCase();
  if (!cat) return false;
  if (cat === 'закуски' || cat === 'добавки') return false;
  return true;
}

/** бобаллы за заказ: +50 за каждый оплаченный напиток */
export function calc_order_bonus(items: bonus_line[]): number {
  let drinks = 0;
  for (const item of items) {
    if (!is_boby_earning_item(item)) continue;
    drinks += Math.max(0, Math.round(Number(item.quantity) || 0));
  }
  return drinks * BOBY_PER_DRINK;
}

/** полная форма с числом: «150 бобаллов» */
export function format_bobyball(count: number): string {
  return `${Math.round(count)} бобаллов`;
}

/** короткая форма: «150 бб» */
export function format_bb(count: number): string {
  return `${Math.round(count)} ${BOBY_SHORT}`;
}

/** @deprecated use format_bobyball */
export function format_boby(count: number): string {
  return format_bobyball(count);
}

export const bonus_earning_rules = [
  `за каждый оплаченный напиток начисляем ${BOBY_PER_DRINK} бобаллов`,
  `накопите ${FREE_DRINK_BONUS_THRESHOLD} бобаллов — получите напиток бесплатно`,
  'закуски и добавки не копятся, за подарок бобаллы не капают',
  `списать ${FREE_DRINK_BONUS_THRESHOLD} бобаллов можно в корзине или на кассе`,
] as const;

const snack_categories = new Set(['закуски']);

export function is_snack_category(category: string): boolean {
  return snack_categories.has(category);
}

export function item_has_volumes(item: menu_item): boolean {
  if (typeof item.has_volumes === 'boolean') return item.has_volumes;
  return !is_snack_category(item.category);
}

export function item_has_toppings(item: menu_item): boolean {
  if (typeof item.has_toppings === 'boolean') return item.has_toppings;
  return !is_snack_category(item.category);
}

export function line_volume_label(category: string): string | null {
  if (is_snack_category(category)) return null;
  return '500 мл';
}

export function get_upsell_items(
  all_items: menu_item[],
  cart_ids: Set<string>,
  lines: { item: { category: string }; quantity: number }[]
): {
  items: menu_item[];
  suggest_snacks: boolean;
} {
  let drinks = 0;
  let snacks = 0;
  for (const line of lines) {
    if (is_snack_category(line.item.category)) snacks += line.quantity;
    else drinks += line.quantity;
  }

  const suggest_snacks = drinks >= snacks;

  const items = all_items
    .filter((item) => {
      if (!item.is_available || cart_ids.has(item.id)) return false;
      if (suggest_snacks) return is_snack_category(item.category);
      return !is_snack_category(item.category);
    })
    .slice(0, 4);

  return { items, suggest_snacks };
}
