'use client';

import { useEffect, useState } from 'react';
import { BRAND_COLOR_ACCENT } from '@/lib/brand';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import online_counter from '@/components/admin/online-counter';
import opening_100_manage from '@/components/admin/opening-100-manage';
import live_carts from '@/components/admin/live-carts';
import push_form from '@/components/admin/push-form';
import { createElement } from 'react';

type stats = {
  orders_today: number;
  revenue_today: number;
  orders_week: number;
  revenue_week: number;
  avg_check_week: number;
  items_today: number;
  top_products: { name: string; quantity: number; revenue: number }[];
  revenue_by_day: { day: string; revenue: number; orders: number }[];
};

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-neutral-200/80 p-4 shadow-sm">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      {hint && <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function business_dashboard() {
  const [data, set_data] = useState<stats | null>(null);
  const [error, set_error] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: stats & { error?: string }) => {
        if (body.error) {
          set_error(body.error);
          return;
        }
        set_data(body);
      })
      .catch(() => set_error('не удалось загрузить аналитику'));
  }, []);

  if (error) {
    return <p className="text-sm text-red-500">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-neutral-500">загрузка аналитики…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="заказов сегодня" value={String(data.orders_today)} />
        <StatCard
          label="выручка сегодня"
          value={`${data.revenue_today.toLocaleString('ru-RU')} ₽`}
        />
        <StatCard
          label="позиций сегодня"
          value={String(data.items_today)}
          hint="напитков и блюд"
        />
        <StatCard
          label="средний чек (7 дн)"
          value={`${data.avg_check_week.toLocaleString('ru-RU')} ₽`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-neutral-200/80 p-4 shadow-sm">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900">выручка по дням</p>
              <p className="text-xs text-neutral-500">за 7 дней · {data.orders_week} заказов</p>
            </div>
            <p className="text-sm font-bold text-accent tabular-nums">
              {data.revenue_week.toLocaleString('ru-RU')} ₽
            </p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenue_by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, key) => [
                    key === 'revenue' ? `${value} ₽` : value,
                    key === 'revenue' ? 'выручка' : 'заказы',
                  ]}
                />
                <Bar dataKey="revenue" fill={BRAND_COLOR_ACCENT} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-neutral-200/80 p-4 shadow-sm">
          <p className="text-sm font-semibold text-neutral-900 mb-3">топ товаров (7 дн)</p>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-neutral-400">пока нет данных</p>
          ) : (
            <ul className="space-y-2.5">
              {data.top_products.map((p, i) => (
                <li key={p.name} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-neutral-700 leading-snug">
                    <span className="text-neutral-400 mr-1.5">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-semibold">{p.quantity} шт</span>
                    <span className="block text-[11px] text-neutral-400">
                      {p.revenue.toLocaleString('ru-RU')} ₽
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-4">
          {createElement(online_counter)}
          {createElement(opening_100_manage)}
        </div>
        <div>{createElement(live_carts)}</div>
        <div className="md:col-span-2 lg:col-span-1">{createElement(push_form)}</div>
      </div>
    </div>
  );
}
