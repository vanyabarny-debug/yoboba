'use client';

import { useEffect } from 'react';
import { hydrate_catalog, publish_catalog_now } from '@/lib/published-client';
import {
  apply_published_promo_store,
  get_promo_store,
  type promo_store,
} from '@/lib/promo-store';
import {
  apply_published_sidebar_ad_store,
  get_sidebar_ad_store,
  type sidebar_ad_store,
} from '@/lib/sidebar-ad-store';
import {
  apply_published_brand_settings,
  get_brand_settings,
  type brand_settings,
} from '@/lib/brand-store';
import {
  apply_published_site_content_store,
  get_site_content_store,
  type site_content_store,
} from '@/lib/site-content-store';
import {
  apply_published_spot_store,
  get_spot_store,
  type spot_store,
} from '@/lib/spot-store';

function is_admin_browser() {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => {
    const v = c.trim();
    return v === 'yoboba_role=admin' || v.startsWith('yoboba_admin=1');
  });
}

export default function published_hydrate() {
  useEffect(() => {
    const admin = is_admin_browser();
    void Promise.all([
      hydrate_catalog<promo_store>('promos').then((store) => {
        if (store) apply_published_promo_store(store);
        else if (admin) publish_catalog_now('promos', get_promo_store());
      }),
      hydrate_catalog<sidebar_ad_store>('sidebar-ads').then((store) => {
        if (store) apply_published_sidebar_ad_store(store);
        else if (admin) publish_catalog_now('sidebar-ads', get_sidebar_ad_store());
      }),
      hydrate_catalog<brand_settings>('brand').then((store) => {
        if (store) apply_published_brand_settings(store);
        else if (admin) publish_catalog_now('brand', get_brand_settings());
      }),
      hydrate_catalog<site_content_store>('site-content').then((store) => {
        if (store) apply_published_site_content_store(store);
        else if (admin) publish_catalog_now('site-content', get_site_content_store());
      }),
      hydrate_catalog<spot_store>('spots').then((store) => {
        if (store) apply_published_spot_store(store);
        else if (admin) publish_catalog_now('spots', get_spot_store());
      }),
    ]);
  }, []);

  return null;
}
