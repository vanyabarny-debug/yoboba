'use client';

import { useEffect, useState } from 'react';
import { get_brand_settings, get_default_brand_settings, subscribe_brand_settings } from '@/lib/brand-store';

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
    <span className={`font-display font-bold tracking-tight leading-none lowercase ${className}`}>
      <span className="text-accent">{brand.brand_word}</span>
      <span className="text-accent-pink">{brand.brand_suffix}</span>
    </span>
  );
}
