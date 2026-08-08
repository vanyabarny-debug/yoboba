import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'napitok-mesyaca-subzero',
    hero_src: '/images/promos/promo16.png?v=7',
    eyebrow: 'напиток месяца',
    primary_cta: {
      href: '/?category=%D0%B3%D0%B0%D0%B7%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%BD%D1%8B%D0%B5%20%D0%B1%D0%B0%D0%B1%D0%BB%20%D1%82%D0%B8',
      label: 'попробовать subzero',
    },
    hero_bg: '#002D7A',
  });
}
