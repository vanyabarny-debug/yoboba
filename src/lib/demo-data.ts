import type { story } from '@/lib/types';
import { default_menu_items } from '@/lib/menu-store';

export const demo_stories: story[] = [
  {
    id: 'story-1',
    image_url: '/images/menu/bt1.svg',
    title: 'бабл ти',
    menu_id: 'bt-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-2',
    image_url: '/images/menu/matcha1.svg',
    title: 'матча',
    menu_id: 'mt-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-3',
    image_url: '/images/menu/dessert1.svg',
    title: 'десерты',
    menu_id: 'ds-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
];

export { default_menu_items as demo_menu };
