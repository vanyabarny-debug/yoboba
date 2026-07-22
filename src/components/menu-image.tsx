'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { menu_item } from '@/lib/types';
import { is_custom_menu_photo } from '@/lib/menu-photo';
import {
  resolve_menu_item_fallback_image_url,
  resolve_menu_item_image_url,
} from '@/lib/menu-store';

type props = {
  item: menu_item;
  className?: string;
  variant?: 'card' | 'thumb' | 'fill';
  /** cover обрезает; contain — целиком влезает */
  fit?: 'cover' | 'contain';
};

function is_unusable_src(src: string | null | undefined) {
  if (!src) return true;
  if (src.endsWith('.svg')) return true;
  return false;
}

function skeleton({ className = '', fill = false }: { className?: string; fill?: boolean }) {
  return (
    <div
      className={`${fill ? 'h-full w-full' : 'aspect-square'} overflow-hidden bg-neutral-200 ${className}`}
      aria-hidden
    >
      <div className="h-full w-full animate-pulse bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200" />
    </div>
  );
}

function menu_image_inner({
  item,
  className = '',
  variant = 'card',
  fit = 'cover',
}: props) {
  const primary = useMemo(
    () => resolve_menu_item_image_url(item),
    [item.id, item.name, item.image_url]
  );
  const fallback = useMemo(
    () => resolve_menu_item_fallback_image_url(item),
    [item.id, item.name, item.image_url]
  );
  const [src, set_src] = useState(() => (is_unusable_src(primary) ? fallback : primary));
  const [failed, set_failed] = useState(() => is_unusable_src(src));
  const [loaded, set_loaded] = useState(false);
  const img_ref = useRef<HTMLImageElement>(null);
  const fill = variant === 'fill';
  const object_fit = fit === 'contain' ? 'object-contain' : 'object-cover';

  useEffect(() => {
    const next = is_unusable_src(primary) ? fallback : primary;
    set_src(next);
    set_failed(is_unusable_src(next));
    set_loaded(false);
  }, [primary, fallback]);

  // из кэша браузера load может прийти до onLoad — проверяем complete
  useEffect(() => {
    if (!src || failed) return;
    const el = img_ref.current;
    if (el && el.complete && el.naturalWidth > 0) {
      set_loaded(true);
    }
  }, [src, failed]);

  if (failed || !src) {
    return skeleton({ className, fill });
  }

  return (
    <div
      className={`relative overflow-hidden ${
        fit === 'contain' ? 'bg-transparent' : 'bg-neutral-200'
      } ${fill ? 'h-full w-full' : 'aspect-square'} ${className}`}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-200" />
      )}
      <img
        ref={img_ref}
        src={src}
        alt={item.name}
        width={800}
        height={800}
        className={`absolute inset-0 h-full w-full ${object_fit} object-center transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading={variant === 'thumb' ? 'lazy' : 'eager'}
        decoding="async"
        draggable={false}
        onLoad={() => set_loaded(true)}
        onError={() => {
          if (fallback && src !== fallback) {
            set_src(fallback);
            set_loaded(false);
            return;
          }
          set_failed(true);
        }}
      />
      {is_custom_menu_photo(src) && variant !== 'thumb' && (
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
    prev.variant === next.variant &&
    prev.fit === next.fit
  );
});
