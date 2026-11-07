import { createElement } from 'react';
import AkciyaPromoPage from '@/components/akciya-promo-page';

export default function page() {
  return createElement(AkciyaPromoPage, {
    slug: 'akciya-25k-prosmotrov',
    hero_src: '/images/promos/promo-25k.png?v=2',
    eyebrow: 'акция',
    primary_cta: {
      href: 'https://vk.ru/yomoyo_kimry',
      label: 'написать в vk',
    },
    hero_bg: '#002d7a',
  });
}
