import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'napitok-mesyaca-subzero',
    hero_src: '/images/promos/promo-subzero.png?v=5',
    eyebrow: 'напиток месяца',
    primary_cta: {
      href: '/?category=%D0%BD%D0%B0%D0%BF%D0%B8%D1%82%D0%BE%D0%BA%20%D0%BC%D0%B5%D1%81%D1%8F%D1%86%D0%B0',
      label: 'попробовать сабзиро',
    },
    hero_bg: '#b8dff5',
  });
}
