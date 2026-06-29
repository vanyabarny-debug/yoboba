import { createElement, Suspense } from 'react';
import home_client from '@/components/home-client';
import { default_categories, default_menu_items } from '@/lib/menu-store';
import { default_promos } from '@/lib/promo-store';
import {
  default_sidebar_interval_ms,
  default_sidebar_slides,
} from '@/lib/sidebar-ad-store';
import { demo_stories } from '@/lib/demo-data';

export default function admin_menu_page() {
  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(home_client, {
      initial_menu: default_menu_items,
      initial_categories: default_categories,
      initial_promos: default_promos,
      initial_sidebar_slides: default_sidebar_slides,
      initial_sidebar_interval_ms: default_sidebar_interval_ms,
      initial_stories: demo_stories,
      demo_mode: true,
      admin_edit_mode: true,
    })
  );
}
