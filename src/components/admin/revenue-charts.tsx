'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { create_client } from '@/lib/supabase/client';

type day_revenue = {
  day: string;
  revenue: number;
};

export default function revenue_charts() {
  const [avg_check, set_avg_check] = useState(0);
  const [chart_data, set_chart_data] = useState<day_revenue[]>([]);

  useEffect(() => {
    const supabase = create_client();

    async function load() {
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { data } = await supabase
        .from('orders')
        .select('total_price, created_at')
        .gte('created_at', since.toISOString())
        .neq('status', 'cancelled');

      const orders = data || [];
      const total = orders.reduce((s, o) => s + Number(o.total_price), 0);
      set_avg_check(orders.length ? Math.round(total / orders.length) : 0);

      const by_day: Record<string, number> = {};
      for (const o of orders) {
        const day = new Date(o.created_at).toLocaleDateString('ru-ru', {
          day: 'numeric',
          month: 'short',
        });
        by_day[day] = (by_day[day] || 0) + Number(o.total_price);
      }

      set_chart_data(
        Object.entries(by_day).map(([day, revenue]) => ({ day, revenue }))
      );
    }

    load();

    const channel = supabase
      .channel('orders-revenue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-sm text-neutral-500">средний чек</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-accent">{avg_check} ₽</p>
        </div>
        <p className="text-xs text-neutral-400">за 7 дней</p>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart_data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="day"
              tick={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }}
            />
            <YAxis tick={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [`${value} ₽`, 'выручка']}
              contentStyle={{ borderRadius: 12, border: '1px solid #f3f4f6' }}
            />
            <Bar dataKey="revenue" fill="#ff3d6e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
