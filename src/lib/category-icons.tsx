/** иконки и цвета разделов меню для кассы */

import type { ReactNode } from 'react';

type icon_props = { className?: string };

export type category_tile_style = {
  label: string;
  icon: (p: icon_props) => ReactNode;
  /** фон плитки */
  bg: string;
  /** цвет иконки и текста */
  fg: string;
  border: string;
};

function icon_wrap({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || 'h-9 w-9'}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** классический бабл ти — стакан с трубочкой и шариками (новая иконка) */
function boba_classic_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M8 22h8" />
        <path d="M9 22V10.5c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5V22" />
        <path d="M10 9V4.8c0-.6.4-1.1 1.2-1.3L14 3" />
        <path d="M9.5 12.5h5" />
        <circle cx="10.5" cy="16" r="1" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="15.2" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18.2" r="0.95" fill="currentColor" stroke="none" />
      </>
    ),
  });
}

function pearl_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M7 6h10l-1 11a4 4 0 0 1-4 3.5h0a4 4 0 0 1-4-3.5L7 6z" />
        <circle cx="10" cy="13" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  });
}

function leaf_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M4.5 19.5c7.5-.8 12-6.5 14-15-6.5 1.8-12.5 6-14 15z" />
        <path d="M7.5 16c2.2-3.2 5.2-5.5 9.2-7.2" />
      </>
    ),
  });
}

function heart_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <path d="M12 20s-7.2-4.5-7.2-9.5A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 7.2 2.7C19.2 15.5 12 20 12 20z" />
    ),
  });
}

function snow_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M12 3v18M5.5 7.5 18.5 16.5M18.5 7.5 5.5 16.5" />
        <circle cx="12" cy="12" r="1.4" />
      </>
    ),
  });
}

function bubbles_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M6 8h11v7.5a3.5 3.5 0 0 1-3.5 3.5H9.5A3.5 3.5 0 0 1 6 15.5V8z" />
        <path d="M17 10h1.4a2 2 0 1 1 0 4H17" />
        <circle cx="9.5" cy="12" r="1.2" />
        <circle cx="12.8" cy="11" r="1.6" />
        <circle cx="11.2" cy="14.2" r="1" />
      </>
    ),
  });
}

function glass_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M8 3h8l-1.1 12.2A3.5 3.5 0 0 1 11.4 18.5h0a3.5 3.5 0 0 1-3.5-3.3L8 3z" />
        <path d="M9.5 8.5h5M11.5 18.5V21" />
      </>
    ),
  });
}

function snack_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <ellipse cx="12" cy="10" rx="7.5" ry="3.2" />
        <path d="M4.5 10v4.5c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V10" />
      </>
    ),
  });
}

function cake_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M4 13h16v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6z" />
        <path d="M4 13c0-2.8 3.6-4.5 8-4.5s8 1.7 8 4.5" />
        <path d="M12 4.5v4M10 6.2 12 4.5l2 1.7" />
      </>
    ),
  });
}

function combo_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <rect x="3.5" y="7" width="7.5" height="11" rx="1.5" />
        <rect x="13" y="7" width="7.5" height="11" rx="1.5" />
        <path d="M7.2 4.2v2.8M16.8 4.2v2.8" />
      </>
    ),
  });
}

function grid_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
      </>
    ),
  });
}

/** палитра в тон бренду: коралл / синий / персик / мята / роза / крем */
const palette: { bg: string; fg: string; border: string }[] = [
  { bg: '#FFE8E8', fg: '#D64545', border: '#FFC9C9' },
  { bg: '#E7EEFF', fg: '#0039A6', border: '#C5D4FF' },
  { bg: '#FFF1E3', fg: '#C45E1A', border: '#FFD7B0' },
  { bg: '#E6F6EF', fg: '#1B7A56', border: '#BFE8D4' },
  { bg: '#FFEAF1', fg: '#C23B6B', border: '#FFC2D4' },
  { bg: '#FFF8E8', fg: '#A67C00', border: '#FFE6A8' },
  { bg: '#EAF4FF', fg: '#1E5BD6', border: '#C2DCFF' },
  { bg: '#FFEDE6', fg: '#E85D3A', border: '#FFD0C0' },
  { bg: '#EEF0FF', fg: '#3D4DB7', border: '#D0D6FF' },
  { bg: '#F0F7E8', fg: '#4F7A22', border: '#D4E8B8' },
];

type rule = {
  test: (c: string) => boolean;
  icon: (p: icon_props) => ReactNode;
  color_i: number;
};

const rules: rule[] = [
  { test: (c) => c.includes('классическ') || (c.includes('бабл ти') && !c.includes('газирован') && !c.includes('джус')), icon: boba_classic_icon, color_i: 0 },
  { test: (c) => c.includes('джусбол'), icon: pearl_icon, color_i: 1 },
  { test: (c) => c.includes('матча'), icon: leaf_icon, color_i: 3 },
  { test: (c) => c === 'пп' || c.startsWith('пп '), icon: heart_icon, color_i: 4 },
  { test: (c) => c.includes('фраппе'), icon: snow_icon, color_i: 6 },
  { test: (c) => c.includes('газирован'), icon: bubbles_icon, color_i: 7 },
  { test: (c) => c.includes('тоник'), icon: glass_icon, color_i: 2 },
  { test: (c) => c.includes('закуск'), icon: snack_icon, color_i: 5 },
  { test: (c) => c.includes('десерт'), icon: cake_icon, color_i: 4 },
  { test: (c) => c.includes('комбо'), icon: combo_icon, color_i: 1 },
];

function hash_index(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % palette.length;
  return h;
}

export function category_tile_meta(category: string): category_tile_style {
  const c = category.trim().toLowerCase();
  for (const rule of rules) {
    if (rule.test(c)) {
      const color = palette[rule.color_i % palette.length];
      return { label: category, icon: rule.icon, ...color };
    }
  }
  const color = palette[hash_index(c)];
  return { label: category, icon: grid_icon, ...color };
}
