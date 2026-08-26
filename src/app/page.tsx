import { createElement, Suspense } from 'react';
import { create_server_client } from '@/lib/supabase/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { demo_stories } from '@/lib/demo-data';
import {
  default_categories,
  apply_menu_item_badges,
  default_menu_items,
  get_default_store,
  merge_menu_item_catalog,
  store_version,
} from '@/lib/menu-store';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';
import { default_promos } from '@/lib/promo-store';
import {
  default_sidebar_interval_ms,
  default_sidebar_slides,
} from '@/lib/sidebar-ad-store';
import home_client from '@/components/home-client';
import type { story } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function resolve_live_menu() {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    return {
      items: apply_menu_item_badges(merge_menu_item_catalog(stored.items)),
      categories: stored.categories?.length ? stored.categories : default_categories,
      demo_mode: false,
    };
  }

  const fresh = get_default_store();
  await write_published_menu(fresh);
  return {
    items: apply_menu_item_badges(fresh.items),
    categories: fresh.categories,
    demo_mode: true,
  };
}

export default async function home_page() {
  const live = await resolve_live_menu();

  if (!is_supabase_configured()) {
    return createElement(
      Suspense,
      { fallback: <div className="min-h-screen bg-page" /> },
      createElement(home_client, {
        initial_menu: live.items,
        initial_categories: live.categories,
        initial_promos: default_promos,
        initial_sidebar_slides: default_sidebar_slides,
        initial_sidebar_interval_ms: default_sidebar_interval_ms,
        initial_stories: demo_stories,
        demo_mode: live.demo_mode,
      })
    );
  }

  const supabase = await create_server_client();
  const { data: stories } = await supabase
    .from('stories')
    .select('*')
    .gt('active_until', new Date().toISOString())
    .order('active_until', { ascending: false });

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(home_client, {
      initial_menu: live.items.length ? live.items : apply_menu_item_badges(default_menu_items),
      initial_categories: live.categories,
      initial_stories: (stories as story[]) || [],
      demo_mode: false,
    })
  );
}
