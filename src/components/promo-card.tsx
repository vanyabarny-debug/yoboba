'use client';

import type { promo_banner } from '@/lib/types';

type props = {
  promo: promo_banner;
  on_click: () => void;
  className?: string;
  size?: 'carousel' | 'inline';
  dim?: boolean;
};

export default function promo_card({
  promo,
  on_click,
  className = '',
  size = 'carousel',
  dim = false,
}: props) {
  const size_class =
    size === 'inline'
      ? 'w-full aspect-[220/260]'
      : 'w-[168px] sm:w-[220px] aspect-[220/260]';

  return (
    <button
      type="button"
      onClick={on_click}
      className={`relative ${size === 'inline' ? '' : 'flex-shrink-0'} ${size_class} rounded-card overflow-hidden isolate text-left hover:brightness-[1.03] transition-[filter,opacity] ${dim ? 'opacity-50 saturate-[0.7]' : ''} ${className}`}
    >
      <img
        src={promo.image_url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <p className="font-bold text-white text-[14px] sm:text-[16px] leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
          {promo.title}
        </p>
      </div>
    </button>
  );
}
