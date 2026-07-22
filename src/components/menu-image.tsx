'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import { is_custom_menu_photo } from '@/lib/menu-photo';
import { resolve_menu_item_image_url } from '@/lib/menu-store';

type props = {
  item: menu_item;
  className?: string;
  variant?: 'card' | 'thumb';
};

function is_unusable_src(src: string | null | undefined) {
  if (!src) return true;
  if (src.endsWith('.svg')) return true;
  return false;
}

function skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`aspect-square overflow-hidden bg-neutral-200 ${className}`}
      aria-hidden
    >
      <div className="h-full w-full animate-pulse bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200" />
    </div>
  );
}

function menu_image_inner({ item, className = '', variant = 'card' }: props) {
  const src = useMemo(() => resolve_menu_item_image_url(item), [item]);
  const unusable = is_unusable_src(src);
  const [failed, set_failed] = useState(unusable);
  const [loaded, set_loaded] = useState(false);

  useEffect(() => {
    const bad = is_unusable_src(src);
    set_failed(bad);
    set_loaded(false);
  }, [src]);

  if (failed || !src) {
    return skeleton({ className });
  }

  return (
    <div className={`relative aspect-square overflow-hidden bg-neutral-200 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200" />
      )}
      <img
        src={src}
        alt={item.name}
        width={800}
        height={800}
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading={variant === 'card' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => set_loaded(true)}
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
    prev.item.name === next.item.name &&
    prev.item.image_url === next.item.image_url &&
    prev.className === next.className &&
    prev.variant === next.variant
  );
});
