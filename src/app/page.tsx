import { createElement, Suspense } from 'react';
import { create_server_client } from '@/lib/supabase/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { demo_stories } from '@/lib/demo-data';
import { default_categories, default_menu_items } from '@/lib/menu-store';
import { resolve_initial_menu, resolve_menu_categories } from '@/lib/menu-from-db';
import { default_promos } from '@/lib/promo-store';
import {
  default_sidebar_interval_ms,
  default_sidebar_slides,
} from '@/lib/sidebar-ad-store';
import home_client from '@/components/home-client';
import type { menu_item, story } from '@/lib/types';

export default async function home_page() {
  if (!is_supabase_configured()) {
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
      })
    );
  }

  const supabase = await create_server_client();
  const [{ data: menu }, { data: stories }] = await Promise.all([
    supabase.from('menu').select('*').eq('is_available', true).order('category'),
    supabase
      .from('stories')
      .select('*')
      .gt('active_until', new Date().toISOString())
      .order('active_until', { ascending: false }),
  ]);

  const db_menu = (menu as menu_item[]) || [];
  const initial_menu = resolve_initial_menu(db_menu) ?? default_menu_items;
  const initial_categories = resolve_menu_categories(initial_menu);

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(home_client, {
      initial_menu,
      initial_categories,
      initial_stories: (stories as story[]) || [],
      demo_mode: false,
    })
  );
}
