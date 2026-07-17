import type { story } from '@/lib/types';
import { default_menu_items } from '@/lib/menu-store';

export const demo_stories: story[] = [
  {
    id: 'story-1',
    image_url: '/images/menu/bt-1.png',
    title: 'бабл ти',
    menu_id: 'bt-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-2',
    image_url: '/images/menu/mt-1.png',
    title: 'матча',
    menu_id: 'mt-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-3',
    image_url: '/images/menu/ds-1.png',
    title: 'десерты',
    menu_id: 'ds-1',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
];

export { default_menu_items as demo_menu };
