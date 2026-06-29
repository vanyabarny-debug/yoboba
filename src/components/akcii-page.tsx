'use client';

import { createElement, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import promo_banners from '@/components/promo-banners';
import site_content_page from '@/components/site-content-page';
import type { promo_banner } from '@/lib/types';
import { get_promo_store, subscribe_promo_store } from '@/lib/promo-store';
import { default_promos } from '@/lib/promo-store';

export default function akcii_page() {
  const router = useRouter();
  const [promos, set_promos] = useState<promo_banner[]>(default_promos);

  useEffect(() => {
    function reload() {
      set_promos(get_promo_store().promos);
    }
    reload();
    return subscribe_promo_store(reload);
  }, []);

  function handle_promo_click(promo: promo_banner) {
    if (promo.link_url && promo.link_url !== '/') {
      router.push(promo.link_url);
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
    ])
  );
}
