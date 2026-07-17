'use client';

import { BRAND_LOGO_SRC } from '@/lib/brand';

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
  const mark_px = MARK_PX[size];

  return (
    <img
      src={BRAND_LOGO_SRC}
      alt=""
      width={mark_px}
      height={mark_px}
      className={`shrink-0 object-contain ${className}`}
      aria-hidden
      draggable={false}
    />
  );
}
