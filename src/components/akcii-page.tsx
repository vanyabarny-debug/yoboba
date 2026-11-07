'use client';

import { createElement, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PromoBanners from '@/components/promo-banners';
import PromoStoryViewer from '@/components/promo-story-viewer';
import SiteContentPage from '@/components/site-content-page';
import type { promo_banner } from '@/lib/types';
import { get_promo_store, subscribe_promo_store } from '@/lib/promo-store';
import { default_promos } from '@/lib/promo-store';

export default function AkciiPage() {
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
      router.push(`/?combo=${encodeURIComponent(promo.menu_id)}`);
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
    SiteContentPage,
    { slug: 'akcii' },
    createElement('div', { className: 'mt-8 -mx-[var(--page-gutter)]' }, [
      createElement(PromoBanners, {
        key: 'promos',
        promos,
        on_promo_click: handle_promo_click,
        layout: 'cards',
      }),
      story_index !== null &&
        createElement(PromoStoryViewer, {
          key: 'story',
          promos: active_promos,
          start_index: story_index,
          open: true,
          on_close: () => set_story_index(null),
          on_action: perform_promo_action,
        }),
    ])
  );
}
