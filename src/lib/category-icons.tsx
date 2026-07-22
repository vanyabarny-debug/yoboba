/** иконки разделов меню — полные названия категорий */

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
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || 'h-8 w-8'}
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
        <path d="M5 7h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V7z" />
        <path d="M17 9h1.8a2.2 2.2 0 1 1 0 4.4H17" />
        <path d="M9 3.5c.4.9.4 1.8 0 2.7M12.5 3.5c.4.9.4 1.8 0 2.7" />
        <circle cx="10" cy="12" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="13" cy="13.5" r="0.7" fill="currentColor" stroke="none" />
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
        <path d="M12 8.5v3.5" />
      </>
    ),
  });
}

function heart_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M12 20s-7.2-4.5-7.2-9.5A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 7.2 2.7C19.2 15.5 12 20 12 20z" />
        <path d="M9.2 11.2c.6-1.2 1.8-1.6 2.8-1" />
      </>
    ),
  });
}

function snow_icon(props: icon_props) {
  return icon_wrap({
    ...props,
    children: (
      <>
        <path d="M12 3v18" />
        <path d="M5.5 7.5 18.5 16.5" />
        <path d="M18.5 7.5 5.5 16.5" />
        <path d="M12 7l2.2-2.2M12 7 9.8 4.8M12 17l2.2 2.2M12 17l-2.2 2.2" />
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
        <path d="M9.5 8.5h5" />
        <path d="M10 12h4" />
        <path d="M11.5 18.5V21" />
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
        <path d="M7 12.2c1.5.6 3.2.9 5 .9s3.5-.3 5-.9" />
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
        <path d="M12 4.5v4" />
        <path d="M10 6.2 12 4.5l2 1.7" />
        <path d="M8 16h2M14 16h2" />
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
        <path d="M5.5 11h3.5M15 11h3.5" />
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

const rules: { test: (c: string) => boolean; icon: (p: icon_props) => ReactNode }[] = [
  { test: (c) => c.includes('джусбол'), icon: pearl_icon },
  { test: (c) => c.includes('матча'), icon: leaf_icon },
  { test: (c) => c === 'пп' || c.startsWith('пп '), icon: heart_icon },
  { test: (c) => c.includes('фраппе'), icon: snow_icon },
  { test: (c) => c.includes('газирован'), icon: bubbles_icon },
  { test: (c) => c.includes('тоник'), icon: glass_icon },
  { test: (c) => c.includes('закуск'), icon: snack_icon },
  { test: (c) => c.includes('десерт'), icon: cake_icon },
  { test: (c) => c.includes('комбо'), icon: combo_icon },
  { test: (c) => c.includes('бабл') || c.includes('классическ'), icon: cup_icon },
];

export function category_tile_meta(category: string): {
  /** полное название категории */
  label: string;
  icon: (p: icon_props) => ReactNode;
} {
  const c = category.trim().toLowerCase();
  for (const rule of rules) {
    if (rule.test(c)) return { label: category, icon: rule.icon };
  }
  return { label: category, icon: grid_icon };
}
