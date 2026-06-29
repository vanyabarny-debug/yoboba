'use client';

import { memo, useEffect, useState } from 'react';
import type { menu_item } from '@/lib/types';
import { is_custom_menu_photo } from '@/lib/menu-photo';

type props = {
  item: menu_item;
  className?: string;
  variant?: 'card' | 'thumb';
};

function menu_image_inner({ item, className = '', variant = 'card' }: props) {
  const [failed, set_failed] = useState(false);
  const src = item.image_url;

  useEffect(() => {
    set_failed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`aspect-square bg-gradient-to-br from-[#ffe0e8] to-[#ff3d6e] flex items-center justify-center ${className}`}
        aria-hidden
      >
        <span className={`text-white/40 ${variant === 'thumb' ? 'text-xl' : 'text-3xl'}`}>🥤</span>
      </div>
    );
  }

  return (
    <div className={`relative aspect-square overflow-hidden bg-[#f3f4f6] ${className}`}>
      <img
        src={src}
        alt={item.name}
        width={800}
        height={800}
        className="absolute inset-0 h-full w-full object-cover object-center"
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => set_failed(true)}
      />
      {is_custom_menu_photo(src) && variant === 'card' && (
        <span className="sr-only">загруженное фото</span>
      )}
    </div>
  );
}

export default memo(menu_image_inner, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.image_url === next.item.image_url &&
    prev.className === next.className &&
    prev.variant === next.variant
  );
});
