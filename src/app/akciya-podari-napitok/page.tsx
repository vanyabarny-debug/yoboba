import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'akciya-podari-napitok',
    hero_src: '/images/promos/promo15.png?v=9',
    eyebrow: 'подарок · из приложения',
    primary_cta: { href: '/?gift=1', label: 'выбрать напиток' },
    hero_bg: '#ff6b6b',
  });
}
