'use client';

import { menu_badge_corner_class, menu_badge_style } from '@/lib/menu-badge';

type props = {
  text: string;
  className?: string;
  size?: 'sm' | 'md';
};

function menu_badge_inner({ text, className = '', size = 'md' }: props) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const size_class =
    size === 'sm'
      ? 'px-2.5 py-[5px] text-[11px]'
      : 'px-3.5 py-[6px] text-[12px] sm:text-[13px]';

  return (
    <span
      className={`inline-flex max-w-none shrink-0 items-center justify-center whitespace-nowrap rounded-pill font-sans font-extrabold lowercase leading-none tracking-[0.01em] text-white ${size_class} ${className}`}
      style={{
        background: menu_badge_style.gradient,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), 0 2px 0 ${menu_badge_style.shadow}, 0 5px 14px rgba(0,0,0,0.2)`,
        textShadow: '0 1px 0 rgba(0,0,0,0.15)',
      }}
    >
      {trimmed}
    </span>
  );
}

export default function menu_badge(props: props) {
  return menu_badge_inner(props);
}

export function menu_badge_on_card(props: props) {
  return (
    <div className={menu_badge_corner_class}>
      {menu_badge_inner({ size: 'sm', ...props })}
    </div>
  );
}
