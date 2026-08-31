'use client';

import { createElement } from 'react';
import type { promo_banner } from '@/lib/types';
import promo_image_with_title from '@/components/promo-image-with-title';

type props = {
  promo: promo_banner;
  on_click: () => void;
  className?: string;
  size?: 'carousel' | 'inline';
};

export default function promo_card({
  promo,
  on_click,
  className = '',
  size = 'carousel',
}: props) {
  const size_class =
    size === 'inline'
      ? 'w-full aspect-[2/3]'
      : 'w-[152px] sm:w-[180px] aspect-[2/3]';

  return (
    <button
      type="button"
      onClick={on_click}
      className={`relative ${size === 'inline' ? '' : 'flex-shrink-0'} ${size_class} rounded-card overflow-hidden isolate text-left hover:brightness-[1.03] transition-[filter,opacity] ${className}`}
    >
      {createElement(promo_image_with_title, { promo })}
    </button>
  );
}
