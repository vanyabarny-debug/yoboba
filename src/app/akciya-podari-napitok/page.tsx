import { createElement } from 'react';
import AkciyaPromoPage from '@/components/akciya-promo-page';

export default function page() {
  return createElement(AkciyaPromoPage, {
    slug: 'akciya-podari-napitok',
    hero_src: '/images/promos/promo15.png?v=9',
    eyebrow: 'подарок · из приложения',
    primary_cta: { href: '/?gift=1', label: 'выбрать напиток' },
    hero_bg: '#ff6b6b',
  });
}
