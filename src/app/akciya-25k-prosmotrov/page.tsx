import { createElement } from 'react';
import akciya_promo_page from '@/components/akciya-promo-page';
import akciya_25k_counter from '@/components/akciya-25k-counter';

export default function page() {
  return createElement(akciya_promo_page, {
    slug: 'akciya-25k-prosmotrov',
    hero_src: '/images/promos/promo-25k.png?v=2',
    eyebrow: 'акция · короткое видео',
    primary_cta: {
      href: 'https://vk.ru/yomoyo_kimry',
      label: 'написать в vk',
    },
    hero_bg: '#002d7a',
    after_intro: createElement(akciya_25k_counter),
  });
}
