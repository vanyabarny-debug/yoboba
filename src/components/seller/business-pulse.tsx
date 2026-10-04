'use client';

import { useEffect, useState } from 'react';
import { BusinessStatusCard, type business_tone } from '@/components/admin/finance/ui';
import { format_rub } from '@/lib/finance/model';

type pulse = {
  revenue: number;
  orders: number;
  profit: number;
  spent: number;
  on_hand: number;
  realized: number;
  break_even: number;
  tone: business_tone;
  detail: string;
};

export default function business_pulse() {
  const [data, set_data] = useState<pulse | null>(null);
  const [error, set_error] = useState('');

  useEffect(() => {
    let stop = false;
    fetch('/api/seller/business', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((body: pulse & { error?: string }) => {
        if (stop) return;
        if (body.error || body.tone == null) {
          set_error(body.error || 'не удалось открыть аналитику');
          return;
        }
        set_data(body);
      })
      .catch(() => {
        if (!stop) set_error('не удалось открыть аналитику');
      });
    return () => {
      stop = true;
    };
  }, []);

  if (error) return <p className="text-center text-sm text-red-500">{error}</p>;
  if (!data) return <p className="text-center text-sm text-neutral-400">считаем месяц…</p>;

  const cards = [
    { label: 'выручка', value: format_rub(data.revenue), hint: `${data.orders} заказов` },
    { label: 'закупки', value: format_rub(data.spent), hint: `на складе ${format_rub(data.on_hand)}` },
    { label: 'в напитках', value: format_rub(data.realized), hint: 'себестоимость сырья' },
    { label: 'чистая прибыль', value: format_rub(data.profit), hint: 'этот месяц' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-8">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.16em] text-accent">общая аналитика</p>
        <h1 className="mt-2 text-2xl font-semibold">этот месяц</h1>
      </div>
      <BusinessStatusCard tone={data.tone} detail={data.detail} />
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center">
        <p className="text-[11px] text-neutral-400">точка безубыточности</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {data.break_even > 0 ? format_rub(data.break_even) : '—'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-center">
            <p className="text-[11px] text-neutral-400">{card.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{card.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
