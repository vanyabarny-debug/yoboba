import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'akciya-studentam',
    hero_src: '/images/promos/promo14.png?v=6',
    eyebrow: 'скидка · всегда',
    primary_cta: { href: '/', label: 'в меню' },
    hero_bg: '#E8F1E8',
  });
}
