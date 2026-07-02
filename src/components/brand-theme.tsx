'use client';

import { useEffect } from 'react';
import {
  apply_brand_theme,
  get_brand_settings,
  subscribe_brand_settings,
} from '@/lib/brand-store';

export default function brand_theme() {
  useEffect(() => {
    apply_brand_theme(get_brand_settings());
    return subscribe_brand_settings(() => {
      apply_brand_theme(get_brand_settings());
    });
  }, []);

  return null;
}
