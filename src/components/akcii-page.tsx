'use client';

import { createElement, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import promo_banners from '@/components/promo-banners';
import promo_story_viewer from '@/components/promo-story-viewer';
import site_content_page from '@/components/site-content-page';
import type { promo_banner } from '@/lib/types';
import { get_promo_store, subscribe_promo_store } from '@/lib/promo-store';
import { default_promos } from '@/lib/promo-store';
import { mark_promo_viewed } from '@/lib/viewed-promos';

export default function akcii_page() {
  const router = useRouter();
  const [promos, set_promos] = useState<promo_banner[]>(default_promos);
  const [story_index, set_story_index] = useState<number | null>(null);

  useEffect(() => {
    function reload() {
      set_promos(get_promo_store().promos);
    }
    reload();
    return subscribe_promo_store(reload);
  }, []);

  const active_promos = promos.filter((p) => p.is_active);

  function handle_promo_click(promo: promo_banner) {
    const idx = active_promos.findIndex((p) => p.id === promo.id);
    set_story_index(idx >= 0 ? idx : 0);
  }

  function perform_promo_action(promo: promo_banner) {
    set_story_index(null);
    if (promo.menu_id) {
      router.push('/');
      return;
    }
    if (promo.category) {
      router.push(`/?category=${encodeURIComponent(promo.category)}`);
      return;
    }
    if (promo.link_url && promo.link_url !== '/') {
      if (promo.link_url.startsWith('/')) {
        router.push(promo.link_url);
      } else {
        window.open(promo.link_url, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    router.push('/');
  }

  return createElement(
    site_content_page,
    { slug: 'akcii' },
    createElement('div', { className: 'mt-8 -mx-[var(--page-gutter)]' }, [
      createElement(promo_banners, {
        key: 'promos',
        promos,
        on_promo_click: handle_promo_click,
      }),
      story_index !== null &&
        createElement(promo_story_viewer, {
          key: 'story',
          promos: active_promos,
          start_index: story_index,
          open: true,
          on_close: () => set_story_index(null),
          on_action: perform_promo_action,
          on_view: (promo: promo_banner) => mark_promo_viewed(promo.id),
        }),
    ])
  );
}
