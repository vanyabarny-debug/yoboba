'use client';

import { useEffect, useRef, useState } from 'react';
import { brand_font_stacks } from '@/lib/brand-font-catalog';
import {
  magnet_promo_title_layout,
  promo_title_scale,
  promo_title_style,
  resolve_promo_title_layout,
  type promo_title_layout,
} from '@/lib/promo-title-layout';

const PROMO_TITLE_FONT_LINK_ID = 'yoboba-promo-title-font';

/** Montserrat Alternates для текста на фото акции */
export function ensure_promo_title_font() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PROMO_TITLE_FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = PROMO_TITLE_FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Montserrat+Alternates:wght@600;700;800;900&display=swap';
  document.head.appendChild(link);
}

export function promo_title_on_image({
  title,
  layout,
  className = '',
  interactive = false,
  on_layout_change,
}: {
  title: string;
  layout?: promo_title_layout | null;
  className?: string;
  /** режим редактора: перетаскивание текста */
  interactive?: boolean;
  on_layout_change?: (layout: promo_title_layout) => void;
}) {
  const wrap_ref = useRef<HTMLDivElement>(null);
  const [scale, set_scale] = useState(1);

  useEffect(() => {
    ensure_promo_title_font();
  }, []);

  useEffect(() => {
    const el = wrap_ref.current;
    if (!el) return;
    const update = () => set_scale(promo_title_scale(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const text = title.trim();
  if (!text) return null;

  const resolved = resolve_promo_title_layout(layout);

  function on_pointer_down(e: React.PointerEvent<HTMLParagraphElement>) {
    if (!interactive || !on_layout_change) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = wrap_ref.current;
    if (!frame) return;

    const apply_layout = on_layout_change;
    if (!apply_layout) return;

    const rect = frame.getBoundingClientRect();
    const start_x = e.clientX;
    const start_y = e.clientY;
    const origin = resolved;
    let latest = origin;

    function move(ev: PointerEvent) {
      const dx = ((ev.clientX - start_x) / rect.width) * 100;
      const dy = ((ev.clientY - start_y) / rect.height) * 100;
      const next = resolve_promo_title_layout({
        ...origin,
        x_pct: origin.x_pct + dx,
        y_pct: origin.y_pct + dy,
      });
      latest = next;
      apply_layout(next);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      apply_layout(magnet_promo_title_layout(latest));
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  return (
    <div ref={wrap_ref} className={`absolute inset-0 z-[3] ${className}`}>
      <p
        onPointerDown={on_pointer_down}
        className={interactive ? 'cursor-grab active:cursor-grabbing touch-none' : 'pointer-events-none'}
        style={{
          ...promo_title_style(resolved, scale),
          fontFamily: brand_font_stacks.montserrat,
        }}
      >
        {text}
      </p>
    </div>
  );
}

export default promo_title_on_image;
