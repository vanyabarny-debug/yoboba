'use client';

import type { menu_item } from '@/lib/types';

/** метки температуры как в PDF-меню: снежинка / огонь (lucide) */
export function menu_temp_marks({
  item,
  className = '',
  size = 14,
}: {
  item: menu_item;
  className?: string;
  size?: number;
}) {
  const cold = item.cold !== false && item.category !== 'комбо';
  const hot = Boolean(item.hot);
  if (!cold && !hot) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={[cold ? 'холодно' : '', hot ? 'горячо' : ''].filter(Boolean).join(' и ')}
    >
      {cold ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4BA3E3"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m10 20-1.25-2.5L6 18" />
          <path d="M10 4 8.75 6.5 6 6" />
          <path d="m14 20 1.25-2.5L18 18" />
          <path d="m14 4 1.25 2.5L18 6" />
          <path d="m17 21-3-6h-4" />
          <path d="m17 3-3 6 1.5 3" />
          <path d="M2 12h6.5L10 9" />
          <path d="m20 10-1.5 2 1.5 2" />
          <path d="M22 12h-6.5L14 15" />
          <path d="m4 10 1.5 2L4 14" />
          <path d="m7 21 3-6-1.5-3" />
          <path d="m7 3 3 6h4" />
        </svg>
      ) : null}
      {hot ? (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F05A28"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ) : null}
    </span>
  );
}

export default menu_temp_marks;
