'use client';

import { useEffect, useState } from 'react';
import { get_brand_settings, get_default_brand_settings, subscribe_brand_settings } from '@/lib/brand-store';
import { brand_font_stacks } from '@/lib/brand-font-catalog';

type props = {
  className?: string;
};

export default function brand_wordmark({ className = '' }: props) {
  const [brand, set_brand] = useState(() => get_default_brand_settings());

  useEffect(() => {
    function reload() {
      set_brand(get_brand_settings());
    }
    reload();
    return subscribe_brand_settings(reload);
  }, []);

  return (
    <span
      className={`block text-left leading-none text-neutral-900 ${className}`}
      style={{
        fontFamily: brand_font_stacks[brand.font_display],
        fontWeight: brand.display_weight,
        letterSpacing: `${brand.display_tracking}em`,
        fontSynthesis: 'none',
        zoom: brand.display_scale,
      }}
    >
      {brand.brand_word}
      {brand.brand_suffix}
    </span>
  );
}
