'use client';

import { useState } from 'react';
import {
  HOUR_BUCKET_LABELS,
  peak_index,
  WEEKDAY_LABELS,
  type store_rhythm,
} from '@/lib/customer-analytics';
import { format_rub } from '@/lib/finance/model';
import { Card } from '@/components/admin/finance/ui';

type mode = 'days' | 'hours';

export default function StoreRhythmCard({
  rhythm,
  period,
}: {
  rhythm: store_rhythm | null | undefined;
  period: string;
}) {
  const [mode, set_mode] = useState<mode>('days');
  const [hover, set_hover] = useState<number | null>(null);

  if (!rhythm) {
    return (
      <Card title="ритм точки" hint={`среднее за период · ${period}`}>
        <p className="text-sm text-neutral-400">загрузка…</p>
      </Card>
    );
  }

  const buckets = mode === 'days' ? rhythm.weekday : rhythm.hour;
  const labels = mode === 'days' ? WEEKDAY_LABELS : HOUR_BUCKET_LABELS;
  const peak = peak_index(buckets.map((b) => b.avg_revenue));
  const max_rev = Math.max(1, ...buckets.map((b) => b.avg_revenue));

  const today_idx = mode === 'days' ? rhythm.today_weekday : rhythm.today_hour_bucket;
  const today_avg = buckets[today_idx]?.avg_revenue ?? 0;
  const today_avg_orders = buckets[today_idx]?.avg_orders ?? 0;
  const hovered = hover != null ? buckets[hover] : null;

  return (
    <Card
      title="ритм точки"
      hint={
        mode === 'days'
          ? `средняя выручка за один такой день недели · ${period}`
          : `средняя выручка за день в этом слоте · ${period}`
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5 rounded-full bg-neutral-100 p-0.5">
          {(
            [
              ['days', 'дни'],
              ['hours', 'время'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                set_mode(id);
                set_hover(null);
              }}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                mode === id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-neutral-400">{rhythm.days_in_period} кал. дн. в периоде</p>
      </div>

      {rhythm.today_in_period ? (
        <p className="mt-2 text-[11px] leading-snug text-neutral-600">
          сегодня:{' '}
          <span className="font-semibold tabular-nums text-neutral-900">
            {rhythm.today_orders} зак. · {format_rub(rhythm.today_revenue)}
          </span>
          {mode === 'days' ? (
            <>
              {' '}
              · ср. по {WEEKDAY_LABELS[rhythm.today_weekday]}: ~
              {today_avg_orders.toLocaleString('ru-RU')} зак. · {format_rub(today_avg)}
            </>
          ) : (
            <>
              {' '}
              · в слоте {rhythm.today_hour_bucket * 2}:00–{rhythm.today_hour_bucket * 2 + 2}:00
              сейчас {rhythm.today_hour_orders} зак. · ср.{' '}
              {today_avg_orders.toLocaleString('ru-RU')} зак./день
            </>
          )}
        </p>
      ) : null}

      <div
        className="relative mt-3 min-h-[2.5rem] rounded-xl bg-neutral-50 px-3 py-2 text-center"
        aria-live="polite"
      >
        {hovered ? (
          <p className="text-sm font-semibold tabular-nums text-neutral-900">
            {mode === 'days'
              ? labels[hover!]
              : `${hover! * 2}:00–${hover! * 2 + 2}:00`}
            <span className="mx-1.5 font-normal text-neutral-300">·</span>
            {format_rub(hovered.avg_revenue)}
            <span className="ml-1.5 text-xs font-medium text-neutral-500">
              ср. · ~{hovered.avg_orders.toLocaleString('ru-RU')} зак.
            </span>
          </p>
        ) : (
          <p className="text-xs text-neutral-400">наведите на столбик — средняя сумма</p>
        )}
      </div>

      <div className="mt-2 flex h-[88px] items-end gap-1">
        {buckets.map((b, i) => {
          const h =
            b.avg_revenue === 0 ? 4 : Math.max(10, Math.round((b.avg_revenue / max_rev) * 72));
          const is_peak = b.avg_revenue > 0 && i === peak;
          const is_today = rhythm.today_in_period && i === today_idx;
          const is_hover = hover === i;
          return (
            <button
              key={`${mode}-${i}`}
              type="button"
              onMouseEnter={() => set_hover(i)}
              onMouseLeave={() => set_hover(null)}
              onFocus={() => set_hover(i)}
              onBlur={() => set_hover(null)}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 outline-none"
              aria-label={
                mode === 'days'
                  ? `${labels[i]}: ${format_rub(b.avg_revenue)}, ~${b.avg_orders} заказов`
                  : `${i * 2}:00–${i * 2 + 2}:00: ${format_rub(b.avg_revenue)}, ~${b.avg_orders} заказов`
              }
            >
              <div
                className={`w-full max-w-[18px] rounded-sm transition-opacity ${
                  is_today ? 'ring-2 ring-accent/40 ring-offset-1' : ''
                } ${is_peak ? 'bg-accent' : 'bg-neutral-200'} ${
                  is_hover ? 'opacity-100' : hover != null ? 'opacity-55' : 'opacity-100'
                }`}
                style={{ height: `${h}px` }}
              />
              <span
                className={`text-[9px] font-medium tabular-nums ${
                  is_hover || is_today ? 'text-accent' : 'text-neutral-400'
                }`}
              >
                {labels[i]}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-neutral-400">
        столбик — средняя выручка; обводка — сегодня; коралловый — пик периода
      </p>
    </Card>
  );
}
