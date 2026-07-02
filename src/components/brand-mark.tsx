'use client';

import { useEffect, useState } from 'react';
import { get_brand_settings, get_default_brand_settings, subscribe_brand_settings } from '@/lib/brand-store';

type props = {
  className?: string;
  size?: 'compact' | 'default' | 'hero';
};

const MARK_PX = {
  compact: 36,
  default: 48,
  hero: 180,
} as const;

export default function BrandMark({ className = '', size = 'default' }: props) {
  const [brand_word, set_brand_word] = useState(() => get_default_brand_settings().brand_word);
  const mark_px = MARK_PX[size];

  useEffect(() => {
    function reload() {
      set_brand_word(get_brand_settings().brand_word);
    }
    reload();
    return subscribe_brand_settings(reload);
  }, []);

  return (
    <span
      className={`relative inline-block shrink-0 font-display font-bold leading-none ${className}`}
      style={{
        width: mark_px,
        height: mark_px,
        ['--mark' as string]: `${mark_px}px`,
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 flex items-center justify-center text-accent-pink lowercase"
        style={{ fontSize: 'calc(var(--mark) * 0.78)', lineHeight: 1 }}
      >
        x
      </span>
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center rounded-[2px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
        style={{
          transform: 'translate(-50%, -50%)',
          padding: 'calc(var(--mark) * 0.035) calc(var(--mark) * 0.07)',
        }}
      >
        <span
          className="font-bold lowercase tracking-tight text-accent"
          style={{
            fontSize: 'calc(var(--mark) * 0.13)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {brand_word}
        </span>
      </span>
    </span>
  );
}
