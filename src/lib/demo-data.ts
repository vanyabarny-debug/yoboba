import type { story } from '@/lib/types';
import { default_menu_items } from '@/lib/menu-store';

export const demo_stories: story[] = [
  {
    id: 'story-1',
    image_url: '/images/menu/original-black.png',
    title: 'чёрный сахар',
    menu_id: 'original-black',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-2',
    image_url: '/images/menu/matcha-latte-tiger.png',
    title: 'матча латте',
    menu_id: 'matcha-latte-tiger',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'story-3',
    image_url: '/images/menu/subzero.png',
    title: 'сабзиро',
    menu_id: 'subzero',
    active_until: new Date(Date.now() + 86400000).toISOString(),
  },
];

export { default_menu_items as demo_menu };
