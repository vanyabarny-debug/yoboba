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
      ? 'w-full aspect-[9/16]'
      : 'w-[152px] sm:w-[180px] aspect-[9/16]';

  return (
    <button
      type="button"
      onClick={on_click}
      className={`relative ${size === 'inline' ? '' : 'flex-shrink-0'} ${size_class} rounded-card overflow-hidden isolate text-left hover:brightness-[1.03] transition-[filter,opacity] bg-neutral-900 ${dim ? 'opacity-50 saturate-[0.7]' : ''} ${className}`}
      style={{
        backgroundImage: `url("${promo.image_url}")`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {!promo.title_in_image && (
        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <p className="font-bold text-white text-[14px] sm:text-[16px] leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
            {promo.title}
          </p>
        </div>
      )}
    </button>
  );
}
