import { createElement, Suspense } from 'react';
import { create_server_client } from '@/lib/supabase/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { demo_stories } from '@/lib/demo-data';
import {
  apply_menu_item_badges,
  default_menu_items,
  upgrade_menu_store,
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
  const store = upgrade_menu_store(stored);
  await write_published_menu(store).catch((e) =>
    console.error('menu publish skipped', e instanceof Error ? e.message : e)
  );
  return {
    items: apply_menu_item_badges(store.items),
    categories: store.categories,
    demo_mode: !stored?.items?.length,
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

  let stories: story[] = [];
  try {
    const supabase = await create_server_client();
    const { data } = await supabase
      .from('stories')
      .select('*')
      .gt('active_until', new Date().toISOString())
      .order('active_until', { ascending: false });
    stories = (data as story[]) || [];
  } catch (e) {
    console.error('stories fetch failed', e instanceof Error ? e.message : e);
  }

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(home_client, {
      initial_menu: live.items.length ? live.items : apply_menu_item_badges(default_menu_items),
      initial_categories: live.categories,
      initial_stories: stories,
      demo_mode: false,
    })
  );
}
