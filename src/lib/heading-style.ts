import type { heading_style } from '@/lib/brand';
import { DEFAULT_HEADING_STYLE } from '@/lib/brand';

export type { heading_style };

export const default_category_heading_styles: Record<string, heading_style> = {
  'напиток месяца': 'playful',
};

export function resolve_heading_style(
  category: string | undefined | null,
  styles?: Record<string, heading_style> | null
): heading_style {
  if (!category) return DEFAULT_HEADING_STYLE;
  return styles?.[category] ?? default_category_heading_styles[category] ?? DEFAULT_HEADING_STYLE;
}

/** классы для заголовка категории меню */
export function category_heading_class_name(
  style: heading_style,
  extra = 'text-xl sm:text-2xl font-bold mb-4 sm:mb-5'
) {
  if (style === 'playful') {
    return `font-heading-playful font-display-scaled ${extra}`;
  }
  return `font-heading-soft ${extra}`;
}

export function page_heading_class_name(style: heading_style = 'soft', extra = '') {
  if (style === 'playful') {
    return `font-heading-playful font-display-scaled ${extra}`.trim();
  }
  return `font-heading-soft ${extra}`.trim();
}
