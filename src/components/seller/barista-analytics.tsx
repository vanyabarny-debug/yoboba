'use client';

import { createElement, useEffect, useState } from 'react';
import type { barista_analytics } from '@/lib/types';
import day_summary_panel from '@/components/seller/day-summary';

type props = {
  seller_id: string;
  seller_name: string;
};

function format_duration(ms: number | null | undefined) {
  if (ms == null || Number.isNaN(ms)) return '—';
  const total_sec = Math.round(ms / 1000);
  const m = Math.floor(total_sec / 60);
  const s = total_sec % 60;
  if (m <= 0) return `${s} с`;
  return `${m} мин ${s.toString().padStart(2, '0')} с`;
}

export default function barista_analytics_panel({ seller_id, seller_name }: props) {
  const [shift_date, set_shift_date] = useState(new Date().toISOString().slice(0, 10));
  const [data, set_data] = useState<barista_analytics | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ shift_date, seller_id });
    fetch(`/api/seller/prep-stats?${qs}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { analytics?: barista_analytics }) => set_data(body.analytics || null))
      .catch(() => set_data(null));
  }, [shift_date, seller_id]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">аналитика · {seller_name}</h2>
        <p className="text-sm text-neutral-500 mt-0.5">скорость выдачи и напитки смены</p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-neutral-600">
          смена
          <input
            type="date"
            value={shift_date}
            onChange={(e) => set_shift_date(e.target.value)}
            className="rounded-lg border border-surface px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-2xl bg-neutral-900 text-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/50">
            средняя выдача заказа
          </p>
          <p className="text-3xl font-bold tabular-nums mt-1">
            {format_duration(data?.avg_fulfillment_ms)}
          </p>
          <p className="text-xs text-white/45 mt-1">
            {data?.fulfillment_count ?? 0} выдач · {data?.prep_count ?? 0} напитков
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">вовремя</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 mt-1">
            {data?.on_time_count ?? 0}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">быстрее</p>
          <p className="text-2xl font-bold tabular-nums text-[#0039a6] mt-1">
            {data?.early_count ?? 0}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">просрочено</p>
          <p className="text-2xl font-bold tabular-nums text-accent mt-1">
            {data?.overdue_count ?? 0}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">чаще всего</p>
          <p className="text-sm font-semibold text-neutral-900 mt-2 line-clamp-2">
            {data?.most_cooked?.name || '—'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {data?.most_cooked ? `${data.most_cooked.count} шт` : ''}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">быстрее всего</p>
          <p className="text-sm font-semibold text-neutral-900 mt-2 line-clamp-2">
            {data?.fastest_drink?.name || '—'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {data?.fastest_drink ? `ср. ${format_duration(data.fastest_drink.avg_ms)}` : ''}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-neutral-100 p-4">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">медленнее всего</p>
          <p className="text-sm font-semibold text-neutral-900 mt-2 line-clamp-2">
            {data?.slowest_drink?.name || '—'}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {data?.slowest_drink ? `ср. ${format_duration(data.slowest_drink.avg_ms)}` : ''}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-neutral-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-50">
          <p className="text-sm font-semibold text-neutral-900">напитки смены</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface text-neutral-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2">напиток</th>
              <th className="text-right px-3 py-2">шт</th>
              <th className="text-right px-3 py-2">ср.</th>
              <th className="text-right px-3 py-2">мин</th>
              <th className="text-right px-3 py-2">макс</th>
            </tr>
          </thead>
          <tbody>
            {!data?.drinks.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  пока нет приготовлений
                </td>
              </tr>
            ) : (
              data.drinks.map((d) => (
                <tr key={d.menu_id} className="border-t border-surface">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                    {format_duration(d.avg_ms)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                    {format_duration(d.fastest_ms)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-accent">
                    {format_duration(d.slowest_ms)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-base font-bold text-neutral-900 mb-3">касса</h3>
        {createElement(day_summary_panel)}
      </div>
    </div>
  );
}
