'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  compute_month_tax,
  format_period,
  format_rub,
  stock_levels,
  summarize_month,
  summarize_period,
  tax_label,
  tax_regime_of,
  with_fact_revenue,
  type sales_cell,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { BreakEvenCard, Card, EmptyState } from '@/components/admin/finance/ui';

const PIE_COLORS = ['#FF6B6B', '#20181B', '#F4A261', '#2A9D8F', '#E9C46A', '#7C6FF7', '#9CA3AF'];

type day_row = { day: string; revenue: number; orders: number };

type fact_response = {
  month: string;
  from?: string;
  to?: string;
  orders: number;
  revenue: number;
  sales: Record<string, Record<string, sales_cell>>;
  by_day?: day_row[];
};

export type pulse_stats = {
  orders_today: number;
  revenue_today: number;
  items_today: number;
  avg_check_week: number;
};

function Kpi({
  label,
  value,
  hint,
  bar,
}: {
  label: string;
  value: string;
  hint?: string;
  bar: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-soft">
      <div className="h-1" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <p className="text-[11px] font-medium text-neutral-400">{label}</p>
        <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900 sm:text-2xl">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-neutral-400">{hint}</p> : null}
      </div>
    </div>
  );
}

export default function DashboardSection({
  state,
  from,
  to,
  pulse,
  on_open_model,
}: section_props & { pulse?: pulse_stats | null; on_open_model?: () => void }) {
  const period = format_period(from, to);
  const stock = useMemo(() => stock_levels(state), [state]);
  const low = stock.filter((s) => s.low);

  const [fact, set_fact] = useState<fact_response | null>(null);

  useEffect(() => {
    let cancelled = false;
    set_fact(null);
    fetch(`/api/admin/finance/sales?from=${from}&to=${to}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: fact_response & { error?: string }) => {
        if (cancelled || body.error) return;
        set_fact(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const live = useMemo(
    () =>
      summarize_period(state, from, to, {
        revenue: fact?.revenue ?? 0,
        sales: fact?.sales,
      }),
    [state, from, to, fact]
  );

  const mix = useMemo(() => {
    const rows: { name: string; value: number }[] = [];
    const source = fact?.sales;
    if (!source) return rows;
    for (const card of state.techCards) {
      const by_size = source[card.id];
      if (!by_size) continue;
      const value = Object.entries(by_size).reduce((s, [, cell]) => s + (cell?.price || 0) * (cell?.qty || 0), 0);
      if (value > 0) rows.push({ name: card.name, value: Math.round(value) });
    }
    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [fact, state.techCards]);

  const month = to.slice(0, 7);
  const md = state.monthsData.find((m) => m.month === month);
  const mtd = from === `${month}-01`;
  const break_even = md
    ? with_fact_revenue(summarize_month(state, md), mtd ? fact?.revenue ?? 0 : 0, state).break_even
    : live.break_even;

  const rent = live.revenue > 0 ? (live.net_profit / live.revenue) * 100 : 0;
  const days = fact?.from === from && fact?.to === to ? fact.by_day ?? [] : [];
  const n_days = Math.max(1, days.length);
  const regime = tax_regime_of(state);
  const patent_day = regime.kind === 'patent' ? live.tax / n_days : 0;
  const fixed_day = (live.opex + live.ndfl + live.insurance + live.amortization) / n_days + patent_day;
  const cogs_rate = live.revenue > 0 ? live.cogs / live.revenue : 0;
  const chart = days.map((d) => {
    const revenue = d.revenue;
    const cogs = revenue * cogs_rate;
    const tax = regime.kind === 'patent' ? 0 : compute_month_tax(state, revenue, cogs + live.opex / n_days);
    const same_month = from.slice(0, 7) === to.slice(0, 7);
    return {
      name: same_month ? String(Number(d.day.slice(8))) : `${d.day.slice(8)}.${d.day.slice(5, 7)}`,
      выручка: Math.round(revenue),
      прибыль: Math.round(revenue - cogs - tax - fixed_day),
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading-soft text-2xl text-neutral-900">панель</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          цифры считаются сами из заказов, склада и модели
          {pulse ? (
            <>
              {' · '}сегодня {pulse.orders_today} зак. · {format_rub(pulse.revenue_today)}
            </>
          ) : null}
          {fact ? ` · ${period} · ${fact.orders} зак.` : ` · ${period}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="выручка" value={format_rub(live.revenue)} hint={fact ? `${fact.orders} заказов` : undefined} bar="#3B82F6" />
        <Kpi label="закупки (сырьё)" value={format_rub(-live.cogs)} bar="#FF6B6B" />
        <Kpi label="пост. расходы" value={format_rub(-live.opex)} bar="#F4A261" />
        <Kpi label={tax_label(state)} value={format_rub(-live.tax)} bar="#2A9D8F" />
        <Kpi label="ндфл с зарплат" value={format_rub(-live.ndfl)} bar="#7C6FF7" />
        <Kpi
          label="чистая прибыль"
          value={format_rub(live.net_profit)}
          hint={`${rent.toFixed(0)}% рент.`}
          bar="#20181B"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <BreakEvenCard
          value={break_even}
          action={
            on_open_model ? (
              <button
                type="button"
                onClick={on_open_model}
                className="rounded-pill bg-white/10 px-3 py-1.5 text-sm text-white/90 transition-colors hover:bg-white/15"
              >
                {live.opex > 0 || live.amortization > 0 ? 'настроить модель' : 'задать расходы и налог'}
              </button>
            ) : null
          }
        />

        <Card title="динамика выручки и чистой прибыли" hint={`по дням · ${period}`}>
          {chart.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={chart.length > 16 ? 1 : 0} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={56}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}к`}
                  />
                  <Tooltip formatter={(v) => format_rub(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="выручка" fill="#FF6B6B" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="прибыль" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>нет данных</EmptyState>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`структура выручки · ${period}`}>
          {mix.length ? (
            <div className="flex h-64 items-center gap-4">
              <div className="h-full min-w-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2}>
                      {mix.map((_, i) => (
                        <Cell key={mix[i].name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => format_rub(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-40 shrink-0 space-y-2 text-xs">
                {mix.slice(0, 6).map((r, i) => (
                  <li key={r.name} className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-neutral-700">{r.name}</span>
                      <span className="tabular-nums text-neutral-400">{format_rub(r.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState>пока нет продаж за этот период</EmptyState>
          )}
        </Card>

        <Card title="склад: что заканчивается" hint="ниже минимума">
          {low.length ? (
            <ul className="space-y-2">
              {low.slice(0, 8).map((s) => (
                <li key={s.material.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-800">{s.material.name}</span>
                  <span className="shrink-0 tabular-nums text-red-500">
                    {Math.round(s.qty)}
                    <span className="ml-1 text-[11px] text-neutral-400">/ {Math.round(s.material.minStock ?? 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>ничего не заканчивается</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

