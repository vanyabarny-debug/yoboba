'use client';

import { useEffect } from 'react';
import {
  apply_brand_theme,
  get_brand_settings,
  subscribe_brand_settings,
} from '@/lib/brand-store';
import { load_brand_google_fonts } from '@/lib/brand-font-catalog';

export default function brand_theme() {
  useEffect(() => {
    function sync() {
      const settings = get_brand_settings();
      load_brand_google_fonts(
        settings.font_sans,
        settings.font_display,
        settings.font_logo,
        settings.font_heading_soft
      );
      apply_brand_theme(settings);
    }
    sync();
    return subscribe_brand_settings(sync);
  }, []);

  return null;
}
