'use client';

import { useEffect } from 'react';
import { brand_font_stacks } from '@/lib/brand-font-catalog';

const PROMO_TITLE_FONT_LINK_ID = 'yoboba-promo-title-font';

/** Montserrat Alternates для белого текста на фото акции */
export function ensure_promo_title_font() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PROMO_TITLE_FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = PROMO_TITLE_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Montserrat+Alternates:wght@700;800&display=swap';
  document.head.appendChild(link);
}

export function promo_title_on_image({
  title,
  className = '',
  size = 'card',
}: {
  title: string;
  className?: string;
  size?: 'card' | 'story' | 'inline';
}) {
  useEffect(() => {
    ensure_promo_title_font();
  }, []);

  const text = title.trim();
  if (!text) return null;

  const size_class =
    size === 'story'
      ? 'text-[28px] sm:text-[32px] leading-[1.15]'
      : size === 'inline'
        ? 'text-[18px] sm:text-[20px] leading-[1.15]'
        : 'text-[15px] sm:text-[17px] leading-[1.15]';

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/55 via-black/20 to-transparent px-3 pb-3.5 pt-10 sm:px-4 sm:pb-4 sm:pt-12 ${className}`}
    >
      <p
        className={`whitespace-pre-line text-center font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] ${size_class}`}
        style={{ fontFamily: brand_font_stacks.montserrat }}
      >
        {text}
      </p>
    </div>
  );
}

export default promo_title_on_image;
