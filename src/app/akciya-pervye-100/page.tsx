import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'akciya-pervye-100',
    hero_src: '/images/promos/promo13.png?v=7',
    eyebrow: 'акция · до 01.09.2026',
    primary_cta: {
      href: '/?category=%D0%BA%D0%BB%D0%B0%D1%81%D1%81%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B8%D0%B5%20%D0%B1%D0%B0%D0%B1%D0%BB%20%D1%82%D0%B8',
      label: 'в меню',
    },
  });
}
