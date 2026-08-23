import type { menu_badge_color, menu_item } from '@/lib/types';

export type { menu_badge_color };

/** фирменный синий (pearl/deep) — гармонирует с коралловым акцентом */
export const menu_badge_style = {
  gradient: 'linear-gradient(180deg, #1e5bd6 0%, #0039a6 55%, #002d7a 100%)',
  shadow: '#001a4d',
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

/** прижата в левый верхний угол, поверх края карточки */
export const menu_badge_corner_class =
  'pointer-events-none absolute z-50 -left-1 -top-1 origin-top-left -rotate-[6deg] sm:-left-1.5 sm:-top-1.5';
