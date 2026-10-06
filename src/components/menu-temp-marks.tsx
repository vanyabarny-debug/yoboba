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

export type drink_temp = 'cold' | 'hot';

export function drink_temps(item: { cold?: boolean; hot?: boolean } | null | undefined): drink_temp[] {
  if (!item) return [];
  const options: drink_temp[] = [];
  if (item.cold) options.push('cold');
  if (item.hot) options.push('hot');
  return options;
}

export function drink_temp_label(temp: drink_temp | undefined): string {
  if (temp === 'cold') return 'холодный';
  if (temp === 'hot') return 'горячий';
  return '';
}

function temp_icon(kind: drink_temp, size: number) {
  if (kind === 'cold') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

/** гость выбирает одну температуру из доступных иконок */
export function menu_temp_choice({
  options,
  value,
  on_change,
  size = 18,
}: {
  options: drink_temp[];
  value?: drink_temp;
  on_change: (next: drink_temp) => void;
  size?: number;
}) {
  if (options.length === 0) return null;
  return (
    <div className="inline-flex rounded-full border border-black/[0.08] bg-white p-0.5" role="group" aria-label="температура">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={drink_temp_label(option)}
            onClick={() => on_change(option)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              active
                ? option === 'cold'
                  ? 'bg-sky-500 text-white'
                  : 'bg-rose-500 text-white'
                : option === 'cold'
                  ? 'text-sky-500 hover:bg-sky-50'
                  : 'text-rose-500 hover:bg-rose-50'
            }`}
          >
            {temp_icon(option, size)}
          </button>
        );
      })}
    </div>
  );
}

/** в крафте и техкарте: какие температуры вообще есть у напитка */
export function menu_temp_switches({
  cold,
  hot,
  on_cold,
  on_hot,
}: {
  cold: boolean;
  hot: boolean;
  on_cold: (on: boolean) => void;
  on_hot: (on: boolean) => void;
}) {
  return (
    <div className="inline-flex gap-2" role="group" aria-label="можно холодным и горячим">
      <button
        type="button"
        aria-pressed={cold}
        onClick={() => on_cold(!cold)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
          cold ? 'bg-sky-500 text-white' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {temp_icon('cold', 16)}
        холодный
      </button>
      <button
        type="button"
        aria-pressed={hot}
        onClick={() => on_hot(!hot)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
          hot ? 'bg-rose-500 text-white' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {temp_icon('hot', 16)}
        горячий
      </button>
    </div>
  );
}

export default menu_temp_marks;
