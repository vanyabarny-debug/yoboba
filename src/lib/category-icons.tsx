/** иконки разделов меню в стиле плиток кассы */

import type { ReactNode } from 'react';

type icon_props = { className?: string };

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
      className={className || 'h-7 w-7'}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function cup_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z" />
        <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M8 3c.5 1 .5 2 0 3M12 3c.5 1 .5 2 0 3" />
      </>
    ),
  });
}

function pearl_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="14" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="15" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  });
}

function leaf_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M5 19c8-1 12-7 14-14-7 2-13 6-14 14z" />
        <path d="M8 16c2-3 5-5 9-7" />
      </>
    ),
  });
}

function heart_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
    ),
  });
}

function snow_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M12 3v18M5 7l14 10M19 7 5 17" />
        <path d="M12 7l2-2M12 7l-2-2M12 17l2 2M12 17l-2 2" />
      </>
    ),
  });
}

function bubbles_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <circle cx="8" cy="14" r="3.5" />
        <circle cx="15" cy="10" r="4" />
        <circle cx="16.5" cy="16.5" r="2.2" />
      </>
    ),
  });
}

function glass_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M7 3h10l-1.2 11.5a3.8 3.8 0 0 1-3.8 3.5h0a3.8 3.8 0 0 1-3.8-3.5L7 3z" />
        <path d="M9 9h6" />
      </>
    ),
  });
}

function snack_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M4 14c2-4 4-6 8-6s6 2 8 6" />
        <path d="M5 14h14v2a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-2z" />
      </>
    ),
  });
}

function cake_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M4 12h16v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7z" />
        <path d="M4 12c0-2.5 3.5-4 8-4s8 1.5 8 4" />
        <path d="M12 4v4M9.5 5.5 12 4l2.5 1.5" />
      </>
    ),
  });
}

function combo_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <rect x="3" y="7" width="8" height="10" rx="1.5" />
        <rect x="13" y="7" width="8" height="10" rx="1.5" />
        <path d="M7 4v3M17 4v3" />
      </>
    ),
  });
}

function grid_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.2" />
        <rect x="14" y="3" width="7" height="7" rx="1.2" />
        <rect x="3" y="14" width="7" height="7" rx="1.2" />
        <rect x="14" y="14" width="7" height="7" rx="1.2" />
      </>
    ),
  });
}

const rules: { test: (c: string) => boolean; icon: (p: icon_props) => ReactNode; short: string }[] = [
  { test: (c) => c.includes('джусбол'), icon: pearl_icon, short: 'джус' },
  { test: (c) => c.includes('матча'), icon: leaf_icon, short: 'матча' },
  { test: (c) => c === 'пп' || c.startsWith('пп '), icon: heart_icon, short: 'пп' },
  { test: (c) => c.includes('фраппе'), icon: snow_icon, short: 'фраппе' },
  { test: (c) => c.includes('газирован'), icon: bubbles_icon, short: 'газ' },
  { test: (c) => c.includes('тоник'), icon: glass_icon, short: 'тоник' },
  { test: (c) => c.includes('закуск'), icon: snack_icon, short: 'еда' },
  { test: (c) => c.includes('десерт'), icon: cake_icon, short: 'десерт' },
  { test: (c) => c.includes('комбо'), icon: combo_icon, short: 'комбо' },
  { test: (c) => c.includes('бабл') || c.includes('классическ'), icon: cup_icon, short: 'бабл' },
];

export function category_tile_meta(category: string): {
  short: string;
  icon: (p: icon_props) => React.ReactNode;
} {
  const c = category.trim().toLowerCase();
  for (const rule of rules) {
    if (rule.test(c)) return { short: rule.short, icon: rule.icon };
  }
  return { short: category.slice(0, 6), icon: grid_icon };
}
