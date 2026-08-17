import { createElement } from 'react';
import akciya_100_page from '@/components/akciya-100-page';

export default function page() {
  return createElement(akciya_100_page, {
    hero_src: '/images/promos/promo13.png?v=7',
  });
}
