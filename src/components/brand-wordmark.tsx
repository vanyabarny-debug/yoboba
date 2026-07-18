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
      className={`block text-left leading-none text-accent ${className}`}
      style={{
        fontFamily: brand_font_stacks[brand.font_logo],
        fontWeight: brand.logo_weight,
        letterSpacing: `${brand.logo_tracking}em`,
        fontSynthesis: 'none',
      }}
    >
      {brand.brand_word}
      {brand.brand_suffix}
    </span>
  );
}
