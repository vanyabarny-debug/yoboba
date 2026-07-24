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

export function calc_order_bonus(total: number): number {
  return Math.floor(total / 10);
}

/** сколько тапикоинов нужно, чтобы получить напиток бесплатно */
export const FREE_DRINK_BONUS_THRESHOLD = 50;

export const bonus_earning_rules = [
  'за каждые 10 ₽ в заказе начисляем 1 тапикоин',
  `накопите ${FREE_DRINK_BONUS_THRESHOLD} тапикоинов — получите напиток бесплатно`,
  'тапикоины начисляются после оформления заказа на ваш аккаунт',
  `списать ${FREE_DRINK_BONUS_THRESHOLD} т. можно в корзине или на кассе`,
] as const;

const snack_categories = new Set(['закуски']);

export function is_snack_category(category: string): boolean {
  return snack_categories.has(category);
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
