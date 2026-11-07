import { createElement } from 'react';
import AkciyaPromoPage from '@/components/akciya-promo-page';

export default function page() {
  return createElement(AkciyaPromoPage, {
    slug: 'akciya-studentam',
    hero_src: '/images/promos/promo14.png?v=9',
    eyebrow: 'скидка · всегда',
    primary_cta: { href: '/', label: 'в меню' },
    hero_bg: '#f9bac2',
  });
}
