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
  days_in_month,
  format_period,
  affordable_payroll,
  format_rub,
  insurance_from_net,
  is_salary_opex,
  moscow_today,
  ndfl_from_net,
  update_month,
  stock_levels,
  warehouse_money,
  summarize_month,
  summarize_period,
  tech_card_cost,
  tax_label,
  tax_regime_of,
  with_fact_revenue,
  type sales_cell,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { BusinessStatusCard, Card, EmptyState, NumInput, cell_input_class, type business_tone } from '@/components/admin/finance/ui';

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

const month_title = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function day_word(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

function month_status(input: {
  month_name: string;
  revenue: number;
  profit: number;
  /** уже на весь месяц, второй раз не растягивать */
  projected_profit?: number;
  salary: number;
  break_even: number;
  elapsed: number;
  days: number;
  recent_daily: number;
  prev_daily: number | null;
}): { tone: business_tone; detail: string } {
  const elapsed = Math.max(1, input.elapsed);
  const closed = elapsed >= input.days;
  const projected_revenue = closed ? input.revenue : (input.revenue / elapsed) * input.days;
  const projected_profit =
    input.projected_profit != null
      ? input.projected_profit
      : closed
        ? input.profit
        : (input.profit / elapsed) * input.days;
  const gap = input.salary > 0 && input.break_even > 0 ? (projected_revenue - input.break_even) / input.break_even : null;

  let tone: business_tone;
  if (gap != null) {
    if (gap < -0.03) tone = 'minus';
    else if (gap <= 0.03) tone = 'zero';
    else if (gap < 0.15) tone = 'plus';
    else if (gap < 0.4) tone = 'ok';
    else tone = 'great';
  } else if (projected_profit < -1000) {
    tone = 'minus';
  } else if (Math.abs(projected_profit) <= 1000) {
    tone = 'zero';
  } else {
    const margin = projected_revenue > 0 ? projected_profit / projected_revenue : 0;
    tone = margin < 0.08 ? 'plus' : margin < 0.18 ? 'ok' : 'great';
  }
  if (input.salary <= 0 && (tone === 'great' || tone === 'ok')) tone = 'plus';

  let trend = '';
  if (input.prev_daily != null && input.prev_daily > 0) {
    if (input.recent_daily > input.prev_daily * 1.08) trend = 'последняя неделя быстрее · ';
    else if (input.recent_daily < input.prev_daily * 0.92) trend = 'последняя неделя тише · ';
  }

  const rounded = Math.round(projected_profit);
  const money = `${rounded > 0 ? '+' : ''}${format_rub(rounded)}`;
  const when = closed
    ? `${input.month_name} закрывается`
    : `по темпу ${elapsed} ${day_word(elapsed)} ${input.month_name} выйдет`;
  const wage = input.salary > 0 ? '' : ' · без фот';
  return { tone, detail: `${trend}${when} на ${money}${wage}` };
}

function Kpi({
  label,
  value,
  hint,
  bar,
  on_click,
  open,
}: {
  label: string;
  value: string;
  hint?: string;
  bar: string;
  on_click?: () => void;
  open?: boolean;
}) {
  const body = (
    <>
      <div className="h-1" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <p className="text-[11px] font-medium text-neutral-400">{label}</p>
        <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900 sm:text-2xl">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-neutral-400">{hint}</p> : null}
      </div>
    </>
  );
  if (!on_click) {
    return <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-soft">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={on_click}
      aria-expanded={open}
      className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white text-left shadow-soft"
    >
      {body}
    </button>
  );
}

function PayrollRoom({
  pool,
  fot,
  on_fot,
  ndfl_rate,
  insurance_rate,
  month_name,
  elapsed,
  days,
}: {
  pool: number;
  fot: number;
  on_fot: (v: number) => void;
  ndfl_rate: number;
  insurance_rate: number;
  month_name: string;
  elapsed: number;
  days: number;
}) {
  const tax = ndfl_from_net(fot, ndfl_rate) + insurance_from_net(fot, insurance_rate);
  const clean_without = pool - fot;
  const clean_with = pool - fot - tax;
  const tax_bits = [
    ndfl_rate > 0 ? `ндфл ${ndfl_rate}%` : '',
    insurance_rate > 0 ? `взносы ${insurance_rate}%` : '',
  ].filter(Boolean);
  const closed = elapsed >= days;
  return (
    <Card
      title="фот"
      hint={
        closed
          ? `${month_name} целиком. чистая — это остаток после зарплаты`
          : `весь ${month_name} по темпу ${elapsed} ${day_word(elapsed)}. чистая уменьшается на зарплату`
      }
    >
      <label className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        фот на руки в месяц
        <NumInput
          value={fot}
          min={0}
          placeholder="0"
          className={`${cell_input_class} w-36`}
          on_change={(v) => on_fot(Math.max(0, Math.round(v)))}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-[11px] font-medium text-neutral-400">без налога</p>
          <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900">
            {format_rub(Math.round(clean_without))}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">чистая после {format_rub(Math.round(fot))}</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
          <p className="text-[11px] font-medium text-neutral-400">с налогом</p>
          <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900">
            {format_rub(Math.round(clean_with))}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {tax_bits.length
              ? `чистая после зарплаты и ${format_rub(Math.round(tax))} · ${tax_bits.join(' · ')}`
              : 'чистая после зарплаты'}
          </p>
        </div>
      </div>
    </Card>
  );
}

function month_salary(state: section_props['state'], month_id: string) {
  const md = state.monthsData.find((m) => m.month === month_id);
  if (!md) return 0;
  return Object.entries(md.opex ?? {})
    .filter(([id]) => is_salary_opex(id))
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
}

export default function DashboardSection({
  state,
  set_state,
  from,
  to,
  pulse,
  on_open_model,
}: section_props & { pulse?: pulse_stats | null; on_open_model?: () => void }) {
  const period = format_period(from, to);
  const stock = useMemo(() => stock_levels(state), [state]);
  const warehouse = useMemo(() => warehouse_money(state, to), [state, to]);
  const low = stock.filter((s) => s.low);

  const [drinks_open, set_drinks_open] = useState(false);
  const [fact, set_fact] = useState<fact_response | null>(null);
  const [month_fact, set_month_fact] = useState<fact_response | null>(null);
  const today = moscow_today();
  const month_id = today.slice(0, 7);
  const month_from = `${month_id}-01`;

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

  useEffect(() => {
    let cancelled = false;
    set_month_fact(null);
    fetch(`/api/admin/finance/sales?from=${month_from}&to=${today}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: fact_response & { error?: string }) => {
        if (cancelled || body.error) return;
        set_month_fact(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month_from, today]);

  const live = useMemo(
    () =>
      summarize_period(state, from, to, {
        revenue: fact?.revenue ?? 0,
        sales: fact?.sales,
      }),
    [state, from, to, fact]
  );

  const drink_costs = useMemo(() => {
    const rows: { name: string; qty: number; cost: number }[] = [];
    const source = fact?.sales;
    if (!source) return rows;
    for (const card of state.techCards) {
      const by_size = source[card.id];
      if (!by_size) continue;
      let qty = 0;
      let cost = 0;
      for (const [size, cell] of Object.entries(by_size)) {
        if (!cell?.qty) continue;
        qty += cell.qty;
        cost += tech_card_cost(state, card, size) * cell.qty;
      }
      if (qty > 0) rows.push({ name: card.name, qty, cost: Math.round(cost) });
    }
    rows.sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'ru'));
    return rows;
  }, [fact, state]);
  const drink_spent = drink_costs.reduce((sum, row) => sum + row.cost, 0);

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

  const month_md = state.monthsData.find((m) => m.month === month_id);
  const month_live = useMemo(
    () =>
      summarize_period(state, month_from, today, {
        revenue: month_fact?.revenue ?? 0,
        sales: month_fact?.sales,
      }),
    [state, month_from, today, month_fact]
  );
  const break_even = month_md
    ? with_fact_revenue(summarize_month(state, month_md), month_fact?.revenue ?? 0, state).break_even
    : month_live.break_even;
  const elapsed = Number(today.slice(8)) || 1;
  const dim = days_in_month(month_id);
  const month_days = month_fact?.from === month_from && month_fact?.to === today ? month_fact.by_day ?? [] : [];
  const recent = month_days.slice(-7);
  const prev = month_days.slice(-14, -7);
  const avg = (rows: day_row[]) =>
    rows.length ? rows.reduce((s, d) => s + d.revenue, 0) / rows.length : 0;
  const fot = month_salary(state, month_id);
  const month_pool = (() => {
    const base = affordable_payroll({
      net_profit: month_live.net_profit,
      salary: month_live.salary,
      ndfl: month_live.ndfl,
      insurance: month_live.insurance,
      ndfl_rate: state.ndflRate,
      insurance_rate: state.insuranceRate,
    }).pool;
    return elapsed >= dim ? base : (base / Math.max(1, elapsed)) * dim;
  })();
  const fot_tax = ndfl_from_net(fot, state.ndflRate) + insurance_from_net(fot, state.insuranceRate);
  const month_name = month_title[Number(month_id.slice(5, 7)) - 1] || 'месяц';
  const status = month_fact
    ? month_status({
        month_name,
        revenue: month_live.revenue,
        profit: month_live.net_profit,
        projected_profit: month_pool - fot - fot_tax,
        salary: fot,
        break_even,
        elapsed,
        days: dim,
        recent_daily: avg(recent),
        prev_daily: prev.length >= 5 ? avg(prev) : null,
      })
    : null;

  function set_fot(v: number) {
    set_state((prev) => {
      const id = prev.opexCategories.find((c) => is_salary_opex(c.id))?.id ?? 'salary';
      const cats = prev.opexCategories.some((c) => c.id === id)
        ? prev.opexCategories
        : [...prev.opexCategories, { id, name: 'зарплатный фонд (ФОТ)' }];
      return update_month({ ...prev, opexCategories: cats }, month_id, (m) => ({
        ...m,
        opex: { ...m.opex, [id]: v },
      }));
    });
  }

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
        <Kpi
          label="на напитки"
          value={format_rub(drink_spent)}
          hint={drinks_open ? 'скрыть по напиткам' : 'по техкартам · развернуть'}
          bar="#E85D4C"
          on_click={() => set_drinks_open((v) => !v)}
          open={drinks_open}
        />
        <Kpi
          label="закупки"
          value={format_rub(warehouse.spent)}
          hint={`на складе ${format_rub(warehouse.on_hand)}`}
          bar="#FF6B6B"
        />
        <Kpi label="пост. расходы" value={format_rub(-live.opex)} bar="#F4A261" />
        <Kpi label={tax_label(state)} value={format_rub(-live.tax)} bar="#2A9D8F" />
        <Kpi label="ндфл с зарплат" value={format_rub(-live.ndfl)} bar="#7C6FF7" />
        <Kpi
          label="чистая прибыль"
          value={format_rub(live.net_profit)}
          hint={`минус сырьё со склада ${format_rub(Math.round(live.cogs + live.cogs_staff + live.cogs_writeoff))} · ${rent.toFixed(0)}%`}
          bar="#20181B"
        />
      </div>

      {drinks_open ? (
        <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-3 shadow-soft">
          <p className="text-[11px] font-medium text-neutral-400">себестоимость каждого напитка · {period}</p>
          {drink_costs.length ? (
            <ul className="mt-2 divide-y divide-neutral-100">
              {drink_costs.map((row) => (
                <li key={row.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-neutral-800">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-400">×{row.qty}</span>
                  <span className="shrink-0 tabular-nums text-neutral-900">{format_rub(row.cost)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">за период продаж с техкартой нет</p>
          )}
        </div>
      ) : null}

      <PayrollRoom
        pool={month_pool}
        fot={fot}
        on_fot={set_fot}
        ndfl_rate={state.ndflRate}
        insurance_rate={state.insuranceRate}
        month_name={month_name}
        elapsed={elapsed}
        days={dim}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <div className="flex flex-col gap-3">
          {status ? (
            <BusinessStatusCard tone={status.tone} detail={status.detail} />
          ) : (
            <div className="rounded-3xl bg-[#20181B] px-6 py-7 text-white shadow-soft">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">статус бизнеса</p>
              <p className="mt-3 font-heading-soft text-3xl text-white/70">считаем месяц</p>
            </div>
          )}
          <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-3 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium text-neutral-400">точка безубыточности</p>
              <p className="font-heading-soft text-lg tabular-nums text-neutral-900">
                {break_even > 0 ? format_rub(break_even) : '—'}
              </p>
            </div>
            <p className="mt-1 text-xs leading-snug text-neutral-400">
              {break_even > 0
                ? `выручка в месяц, ниже которой ${month_title[Number(month_id.slice(5, 7)) - 1] || 'месяц'} уходит в минус`
                : 'задайте постоянные расходы — появится порог'}
            </p>
            {on_open_model ? (
              <button
                type="button"
                onClick={on_open_model}
                className="mt-3 text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline"
              >
                {month_live.opex > 0 || month_live.amortization > 0 ? 'настроить модель' : 'задать расходы и налог'}
              </button>
            ) : null}
          </div>
        </div>

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

