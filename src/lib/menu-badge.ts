import type { menu_badge_color, menu_item } from '@/lib/types';

export type { menu_badge_color };

/** единый оранжевый для всех плашек */
export const menu_badge_style = {
  gradient: 'linear-gradient(180deg, #ffb74d 0%, #ff9100 50%, #ff6900 100%)',
  shadow: '#e65100',
};

export function menu_item_has_badge(item: menu_item) {
  return Boolean(item.badge_text?.trim());
}

export function normalize_menu_badge(item: menu_item): menu_item {
  const text = item.badge_text?.trim();
  if (!text) {
    return { ...item, badge_text: '', badge_color: undefined };
  }
  return {
    ...item,
    badge_text: text,
    badge_color: 'orange',
  };
}

/** внутри блока фото, по диагонали */
export const menu_badge_corner_class =
  'pointer-events-none absolute z-30 left-2 top-2 origin-top-left -rotate-[12deg] sm:left-2.5 sm:top-2.5';
