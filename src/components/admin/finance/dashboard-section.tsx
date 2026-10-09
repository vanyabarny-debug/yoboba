'use client';

import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
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
  break_even_revenue,
  compute_month_tax,
  days_in_month,
  each_day,
  format_period,
  format_rub,
  month_fixed_totals,
  moscow_today,
  merge_payroll_with_sellers,
  new_id,
  PAYROLL_KINDS,
  payroll_totals,
  project_month_net,
  resolve_month_payroll,
  set_month_payroll,
  stock_levels,
  warehouse_money,
  summarize_period,
  tech_card_cost,
  custom_payroll_rate,
  custom_taxes_of,
  tax_label,
  tax_regime_of,
  type payroll_kind,
  type payroll_line,
  type sales_cell,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import ModelSection from '@/components/admin/finance/model-section';
import StoreRhythmCard from '@/components/admin/finance/store-rhythm-card';
import type { store_rhythm } from '@/lib/customer-analytics';
import type { seller, store_spot } from '@/lib/types';
import {
  get_spots,
  seller_spot_labels,
  seller_works_at,
  subscribe_spot_store,
} from '@/lib/spot-store';
import {
  BusinessStatusCard,
  Card,
  EmptyState,
  MenuSelect,
  NumInput,
  RentabilityCard,
  cell_input_class,
  field_class,
  type business_tone,
} from '@/components/admin/finance/ui';

const PIE_COLORS = ['#FF6B6B', '#20181B', '#F4A261', '#2A9D8F', '#E9C46A', '#7C6FF7', '#9CA3AF'];

type day_row = { day: string; revenue: number; orders: number; cups?: number };

type fact_response = {
  month: string;
  from?: string;
  to?: string;
  orders: number;
  revenue: number;
  cups?: number;
  sales: Record<string, Record<string, sales_cell>>;
  by_day?: day_row[];
  rhythm?: store_rhythm;
  spot_id?: string | null;
  spot_label?: string;
  spots_count?: number;
  avg_revenue_per_spot?: number;
  avg_orders_per_spot?: number;
  by_spot?: { spot_id: string | null; label: string; revenue: number; orders: number }[];
};

function sales_qs(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

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

  const when = closed
    ? `${input.month_name} закрывается`
    : `по темпу ${elapsed} ${day_word(elapsed)} ${input.month_name}`;
  const wage = input.salary > 0 ? '' : ' · без фот';
  return { tone, detail: `${trend}${when}${wage}` };
}

function Kpi({
  label,
  value,
  sub,
  bar,
  on_click,
  open,
  expand,
  className = '',
}: {
  label: string;
  value: string;
  /** строка под суммой, напр. безубыточность у выручки */
  sub?: string;
  bar: string;
  on_click?: () => void;
  open?: boolean;
  expand?: ReactNode;
  className?: string;
}) {
  const wide = open && expand;
  const head = (
    <>
      <div className="h-1" style={{ background: bar }} />
      <div className="px-4 py-3.5">
        <p className="text-[12px] font-semibold text-neutral-700">{label}</p>
        <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900 sm:text-2xl">{value}</p>
        {sub ? <p className="mt-1 text-[11px] font-medium tabular-nums text-neutral-500">{sub}</p> : null}
      </div>
    </>
  );
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-soft ${
        wide ? 'col-span-2 md:col-span-3 xl:col-span-6' : ''
      } ${className}`}
    >
      {on_click ? (
        <button type="button" onClick={on_click} aria-expanded={open} className="w-full text-left">
          {head}
        </button>
      ) : (
        head
      )}
      {wide ? <div className="border-t border-neutral-100 px-4 py-3">{expand}</div> : null}
    </div>
  );
}

function FotEditor({
  lines,
  ndfl,
  ndfl_rate,
  tax_toggle_label = 'ндфл',
  people,
  sellers_loading,
  sellers_error,
  on_retry_sellers,
  spot_labels,
  on_change,
}: {
  lines: payroll_line[];
  ndfl: number;
  ndfl_rate: number;
  /** подпись чекбокса облагаемой выплаты */
  tax_toggle_label?: string;
  /** активные сотрудники для выбора */
  people: { id: string; name: string; role_title?: string; salary_net?: number; with_ndfl?: boolean }[];
  sellers_loading?: boolean;
  sellers_error?: string;
  on_retry_sellers?: () => void;
  /** sellerId → подпись точек */
  spot_labels?: Record<string, string>;
  on_change: (lines: payroll_line[]) => void;
}) {
  function patch(id: string, next: Partial<payroll_line>) {
    on_change(lines.map((l) => (l.id === id ? { ...l, ...next } : l)));
  }
  function remove(id: string) {
    on_change(lines.filter((l) => l.id !== id));
  }
  function person_label(p: { name: string; role_title?: string }) {
    const role = (p.role_title || '').trim();
    return role ? `${role} ${p.name}` : p.name;
  }
  function assign_person(line_id: string, seller_id: string) {
    if (!seller_id) {
      patch(line_id, { sellerId: undefined, name: '' });
      return;
    }
    const p = people.find((x) => x.id === seller_id);
    if (!p) return;
    const amount = Math.max(0, Math.round(Number(p.salary_net) || 0));
    patch(line_id, {
      sellerId: p.id,
      name: person_label(p),
      withNdfl: p.with_ndfl != null ? Boolean(p.with_ndfl) : amount > 0,
    });
  }
  function add_payment(seller_id?: string) {
    const p = seller_id ? people.find((x) => x.id === seller_id) : people[0];
    const amount = p ? Math.max(0, Math.round(Number(p.salary_net) || 0)) : 0;
    on_change([
      ...lines,
      {
        id: new_id('pay'),
        ...(p ? { sellerId: p.id } : {}),
        name: p ? person_label(p) : '',
        amount: p && lines.every((l) => l.sellerId !== p.id) ? amount : 0,
        withNdfl: p ? (p.with_ndfl != null ? Boolean(p.with_ndfl) : amount > 0) : true,
        kind: p && lines.every((l) => l.sellerId !== p.id) ? 'salary' : 'one_time',
        note: '',
      },
    ]);
  }
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div onClick={stop} onKeyDown={stop}>
      <p className="mb-2 text-[11px] text-neutral-400">
        сотрудник · тип · сумма · {tax_toggle_label} · комментарий
      </p>
      {sellers_error ? (
        <p className="mb-2 text-sm text-red-500">
          {sellers_error}{' '}
          {on_retry_sellers ? (
            <button type="button" className="font-medium underline" onClick={on_retry_sellers}>
              ещё раз
            </button>
          ) : null}
        </p>
      ) : null}
      <ul className="divide-y divide-neutral-100">
        {lines.length ? (
          lines.map((line) => {
            const known = Boolean(line.sellerId && people.some((p) => p.id === line.sellerId));
            const person_options = [
              ...(line.sellerId && !known
                ? [{ id: line.sellerId, label: line.name || 'бывший сотрудник' }]
                : []),
              ...people.map((p) => ({
                id: p.id,
                label: person_label(p),
                hint: spot_labels?.[p.id],
              })),
            ];
            return (
              <li key={line.id} className="space-y-2 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <MenuSelect
                    className="min-w-[10rem] flex-1"
                    menu_className="w-full min-w-[14rem]"
                    value={line.sellerId || ''}
                    placeholder="выбрать сотрудника"
                    options={person_options}
                    on_change={(id) => assign_person(line.id, id)}
                  />
                  <MenuSelect
                    className="w-[8.5rem] shrink-0"
                    menu_className="w-[8.5rem]"
                    value={line.kind || 'salary'}
                    options={PAYROLL_KINDS.map((k) => ({ id: k.id, label: k.label }))}
                    on_change={(id) => patch(line.id, { kind: id as payroll_kind })}
                  />
                  <NumInput
                    value={line.amount}
                    min={0}
                    placeholder="₽"
                    className={`${cell_input_class} w-28`}
                    on_change={(v) => patch(line.id, { amount: Math.max(0, Math.round(v)) })}
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300 text-accent focus:ring-accent/30"
                      checked={line.withNdfl}
                      onChange={(e) => patch(line.id, { withNdfl: e.target.checked })}
                    />
                    {tax_toggle_label}
                    {ndfl_rate > 0 ? ` ${ndfl_rate}%` : ''}
                  </label>
                  <button
                    type="button"
                    className="shrink-0 px-1 text-xs text-neutral-400 hover:text-red-500"
                    onClick={() => remove(line.id)}
                  >
                    убрать
                  </button>
                </div>
                <input
                  className={`${field_class} w-full py-1.5 text-xs`}
                  placeholder="комментарий к выплате"
                  value={line.note || ''}
                  maxLength={200}
                  onChange={(e) => patch(line.id, { note: e.target.value })}
                />
              </li>
            );
          })
        ) : (
          <li className="py-2 text-sm text-neutral-400">
            {sellers_loading
              ? 'загружаю персонал…'
              : people.length
                ? 'пока нет выплат — нажмите «+ выплата»'
                : 'в персонале пока никого — добавьте сотрудников в разделе точки'}
          </li>
        )}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-neutral-300"
          disabled={!people.length && !sellers_loading}
          onClick={() => add_payment()}
        >
          + выплата
        </button>
        {ndfl > 0 ? (
          <span className="ml-auto text-[11px] tabular-nums text-neutral-400">
            {tax_toggle_label} {format_rub(Math.round(ndfl))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardSection({
  state,
  set_state,
  from,
  to,
  menu = [],
  spot_id = '',
}: section_props & { pulse?: pulse_stats | null }) {
  const period = format_period(from, to);
  const stock = useMemo(() => stock_levels(state), [state]);
  const warehouse = useMemo(() => warehouse_money(state, to), [state, to]);
  const low = stock.filter((s) => s.low);

  const [drinks_open, set_drinks_open] = useState(false);
  const [fot_open, set_fot_open] = useState(false);
  const [opex_open, set_opex_open] = useState(false);
  const [mix_with_cogs, set_mix_with_cogs] = useState(false);
  const [fact, set_fact] = useState<fact_response | null>(null);
  const [mtd_fact, set_mtd_fact] = useState<fact_response | null>(null);
  const [sellers, set_sellers] = useState<seller[]>([]);
  const [sellers_loading, set_sellers_loading] = useState(true);
  const [sellers_error, set_sellers_error] = useState('');
  const [sellers_tick, set_sellers_tick] = useState(0);
  const [spots, set_spots] = useState<store_spot[]>([]);
  const today = moscow_today();
  /** месяц плашек / фота — по выбранному периоду (конец диапазона) */
  const month_id = to.slice(0, 7);
  const month_from = `${month_id}-01`;
  const dim = days_in_month(month_id);
  const month_end = `${month_id}-${String(dim).padStart(2, '0')}`;
  const current_month = today.slice(0, 7);
  const month_is_open = month_id === current_month && today < month_end;
  /** прошедший месяц / закрытый период → точные цифры; открытый текущий → ориентир */
  const period_exact = !month_is_open || to < today;
  const should_project = !period_exact && from.slice(0, 7) === month_id;

  useEffect(() => {
    set_spots(get_spots());
    return subscribe_spot_store(() => set_spots(get_spots()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    set_fact(null);
    fetch(
      `/api/admin/finance/sales${sales_qs({ from, to, spot_id: spot_id || undefined })}`,
      { credentials: 'same-origin' }
    )
      .then((r) => r.json())
      .then((body: fact_response & { error?: string }) => {
        if (cancelled || body.error) return;
        set_fact(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [from, to, spot_id]);

  useEffect(() => {
    let cancelled = false;
    set_sellers_loading(true);
    set_sellers_error('');
    fetch('/api/sellers', { credentials: 'same-origin' })
      .then(async (r) => {
        const body = (await r.json()) as { sellers?: seller[]; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          set_sellers([]);
          set_sellers_error(body.error || 'не удалось загрузить персонал');
          return;
        }
        if (!Array.isArray(body.sellers)) {
          set_sellers([]);
          set_sellers_error('некорректный ответ персонала');
          return;
        }
        set_sellers(body.sellers);
      })
      .catch(() => {
        if (cancelled) return;
        set_sellers([]);
        set_sellers_error('не удалось загрузить персонал');
      })
      .finally(() => {
        if (!cancelled) set_sellers_loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellers_tick]);

  useEffect(() => {
    if (!should_project) {
      set_mtd_fact(null);
      return;
    }
    if (from === month_from && to === today) {
      set_mtd_fact(null);
      return;
    }
    let cancelled = false;
    set_mtd_fact(null);
    fetch(
      `/api/admin/finance/sales${sales_qs({ from: month_from, to: today, spot_id: spot_id || undefined })}`,
      { credentials: 'same-origin' }
    )
      .then((r) => r.json())
      .then((body: fact_response & { error?: string }) => {
        if (cancelled || body.error) return;
        set_mtd_fact(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [should_project, month_from, today, from, to, spot_id]);

  const live = useMemo(
    () =>
      summarize_period(state, from, to, {
        revenue: fact?.revenue ?? 0,
        sales: fact?.sales,
      }),
    [state, from, to, fact]
  );

  const mtd_live = useMemo(() => {
    if (!should_project) return live;
    if (from === month_from && to === today) return live;
    return summarize_period(state, month_from, today, {
      revenue: mtd_fact?.revenue ?? 0,
      sales: mtd_fact?.sales,
    });
  }, [should_project, from, month_from, to, today, live, state, mtd_fact]);

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
    const rows: { name: string; value: number; revenue: number; cost: number }[] = [];
    const source = fact?.sales;
    if (!source) return rows;
    for (const card of state.techCards) {
      const by_size = source[card.id];
      if (!by_size) continue;
      let revenue = 0;
      let cost = 0;
      for (const [size, cell] of Object.entries(by_size)) {
        if (!cell?.qty) continue;
        revenue += (cell.price || 0) * cell.qty;
        cost += tech_card_cost(state, card, size) * cell.qty;
      }
      if (revenue <= 0 && cost <= 0) continue;
      const value = mix_with_cogs ? Math.round(revenue - cost) : Math.round(revenue);
      rows.push({
        name: card.name,
        value,
        revenue: Math.round(revenue),
        cost: Math.round(cost),
      });
    }
    rows.sort((a, b) => b.value - a.value);
    return rows;
  }, [fact, state, mix_with_cogs]);

  const month_md = state.monthsData.find((m) => m.month === month_id);
  const month_name = month_title[Number(month_id.slice(5, 7)) - 1] || 'месяц';
  const elapsed = should_project ? Number(today.slice(8)) || 1 : dim;
  const rhythm_src = should_project
    ? from === month_from && to === today
      ? fact?.rhythm
      : mtd_fact?.rhythm
    : fact?.rhythm;
  const month_proj = should_project
    ? project_month_net(state, {
        month_id,
        today,
        mtd: mtd_live,
        weekday_avg_revenue: rhythm_src?.weekday.map((b) => b.avg_revenue) ?? null,
      })
    : null;
  const plaque_net = period_exact ? Math.round(live.net_profit) : (month_proj?.projected_net ?? 0);
  const plaque_rent =
    period_exact
      ? live.revenue > 0
        ? live.net_profit / live.revenue
        : 0
      : (month_proj?.rentability ?? 0);
  const margin_pct = live.revenue > 0 ? (live.revenue - live.cogs) / live.revenue : 0;
  const period_days = Math.max(1, each_day(from, to).length);
  const staff_wo_monthly =
    period_days > 0 ? ((live.cogs_staff + live.cogs_writeoff) / period_days) * dim : 0;
  const break_even = break_even_revenue(state, month_id, {
    margin_pct,
    staff_writeoff_monthly: staff_wo_monthly,
  });
  const month_tot = month_fixed_totals(state, month_id);

  const trend_days =
    (should_project
      ? from === month_from && to === today
        ? fact?.by_day
        : mtd_fact?.by_day
      : fact?.by_day) ?? [];
  const recent = trend_days.slice(-7);
  const prev = trend_days.slice(-14, -7);
  const avg = (rows: day_row[]) =>
    rows.length ? rows.reduce((s, d) => s + d.revenue, 0) / rows.length : 0;

  const month_pay = month_md ? resolve_month_payroll(state, month_md) : null;
  const stored_payroll = month_md?.payroll;
  const fot_lines = useMemo(() => {
    const all = merge_payroll_with_sellers(stored_payroll ?? month_pay?.lines, sellers);
    if (!spot_id) return all;
    const allowed = new Set(
      sellers.filter((s) => seller_works_at(s.spot_ids, spot_id)).map((s) => s.id)
    );
    return all.filter((l) => l.sellerId && allowed.has(l.sellerId));
  }, [stored_payroll, month_pay?.lines, sellers, spot_id]);
  const sellers_for_fot = useMemo(
    () =>
      sellers.filter(
        (s) => s.is_active !== false && seller_works_at(s.spot_ids, spot_id || null)
      ),
    [sellers, spot_id]
  );
  const seller_spot_label_map = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sellers) {
      map[s.id] = seller_spot_labels(s.spot_ids, spots);
    }
    return map;
  }, [sellers, spots]);
  const is_custom_tax = state.taxRegime === 'custom';
  const fot_ndfl_rate = is_custom_tax ? 0 : state.ndflRate;
  const fot_ins_rate = is_custom_tax
    ? custom_payroll_rate(custom_taxes_of(state))
    : state.insuranceRate;
  const fot_merged = useMemo(
    () => ({ lines: fot_lines, ...payroll_totals(fot_lines, fot_ndfl_rate, fot_ins_rate) }),
    [fot_lines, fot_ndfl_rate, fot_ins_rate]
  );
  /** плашки ФОТ / пост. / ндфл — сумма за месяц; в чистую периода идёт доля */
  const fot_month = fot_lines.length ? fot_merged.net : month_tot.salary;
  const fot_ndfl_month = fot_lines.length ? fot_merged.ndfl : month_tot.ndfl;
  const fot_payroll_tax_month = is_custom_tax
    ? fot_lines.length
      ? fot_merged.insurance
      : month_tot.insurance
    : fot_ndfl_month;
  const other_opex_month = month_tot.other_opex;

  // подтянуть всех активных сотрудников в ФОТ месяца (даже с зп = 0)
  useEffect(() => {
    if (!sellers.length || !month_id) return;
    const existing = Array.isArray(stored_payroll) ? stored_payroll : [];
    const active = sellers.filter((s) => s.is_active !== false);
    if (!active.length) return;
    const linked = new Set(existing.map((l) => l.sellerId).filter(Boolean));
    const missing = active.some((s) => !linked.has(s.id));
    if (!missing && existing.some((l) => l.sellerId)) return;
    const merged = merge_payroll_with_sellers(existing, sellers);
    if (!merged.length) return;
    set_state((prev) => set_month_payroll(prev, month_id, merged));
  }, [sellers, month_id, stored_payroll, set_state]);

  const status = fact
    ? month_status({
        month_name,
        revenue: should_project ? mtd_live.revenue : live.revenue,
        profit: should_project ? mtd_live.net_profit : live.net_profit,
        projected_profit: plaque_net,
        salary: fot_month,
        break_even,
        elapsed: period_exact ? dim : elapsed,
        days: dim,
        recent_daily: avg(recent),
        prev_daily: prev.length >= 5 ? avg(prev) : null,
      })
    : null;

  function set_payroll_lines(lines: payroll_line[]) {
    set_state((prev) => set_month_payroll(prev, month_id, lines));
  }
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
      стаканы: d.cups ?? 0,
    };
  });
  const cups_period = days.reduce((s, d) => s + (d.cups ?? 0), 0);
  const cups_avg_day = n_days > 0 ? cups_period / n_days : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.75fr)]">
        {status ? (
          <BusinessStatusCard
            tone={status.tone}
            detail={status.detail}
            net={plaque_net}
            net_approx={!period_exact}
            net_label={period_exact ? 'чистая' : 'ориентир чистой'}
          />
        ) : (
          <div className="rounded-3xl bg-[#20181B] px-6 py-7 text-white shadow-soft">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">статус бизнеса</p>
            <p className="mt-3 font-heading-soft text-3xl text-white/70">считаем месяц</p>
          </div>
        )}
        <RentabilityCard value={plaque_rent} approx={!period_exact} detail={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="выручка"
          value={format_rub(live.revenue)}
          sub={break_even > 0 ? `безубыточность ${format_rub(Math.round(break_even))}` : undefined}
          bar="#3B82F6"
        />
        <Kpi
          label="на напитки"
          value={format_rub(-drink_spent)}
          bar="#E85D4C"
          on_click={() => {
            set_drinks_open((v) => !v);
            if (!drinks_open) {
              set_fot_open(false);
              set_opex_open(false);
            }
          }}
          open={drinks_open}
          expand={
            drink_costs.length ? (
              <ul className="divide-y divide-neutral-100">
                {drink_costs.map((row) => (
                  <li key={row.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-neutral-800">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-neutral-400">×{row.qty}</span>
                    <span className="shrink-0 tabular-nums text-neutral-900">{format_rub(row.cost)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">нет продаж с техкартой</p>
            )
          }
        />
        <Kpi
          label="фот"
          value={format_rub(-fot_month)}
          bar="#E07A5F"
          on_click={() => {
            set_fot_open((v) => !v);
            if (!fot_open) {
              set_drinks_open(false);
              set_opex_open(false);
            }
          }}
          open={fot_open}
          expand={
            <FotEditor
              lines={fot_lines}
              ndfl={fot_payroll_tax_month}
              ndfl_rate={is_custom_tax ? fot_ins_rate : state.ndflRate}
              tax_toggle_label={is_custom_tax ? 'налог' : 'ндфл'}
              people={sellers_for_fot}
              sellers_loading={sellers_loading}
              sellers_error={sellers_error}
              on_retry_sellers={() => set_sellers_tick((n) => n + 1)}
              spot_labels={seller_spot_label_map}
              on_change={set_payroll_lines}
            />
          }
        />
        <Kpi
          label="пост. расходы"
          value={format_rub(-other_opex_month)}
          bar="#F4A261"
          on_click={() => {
            set_opex_open((v) => !v);
            if (!opex_open) {
              set_drinks_open(false);
              set_fot_open(false);
            }
          }}
          open={opex_open}
          expand={
            <ModelSection
              state={state}
              set_state={set_state}
              month={month_id}
              from={from}
              to={to}
              set_period={() => {}}
              set_month={() => {}}
              menu={menu}
              embedded
            />
          }
        />
        <Kpi label={tax_label(state)} value={format_rub(-live.tax)} bar="#2A9D8F" />
        <Kpi
          label={
            regime.id === 'custom'
              ? 'взносы с ФОТ'
              : live.insurance > 0
                ? 'ндфл + страховые'
                : 'ндфл'
          }
          value={format_rub(-(fot_ndfl_month + month_tot.insurance))}
          bar="#7C6FF7"
        />
        <Kpi label="чистая" value={format_rub(live.net_profit)} bar="#20181B" />
        <Kpi
          label="закупки"
          value={format_rub(live.cogs_actual > 0 ? live.cogs_actual : warehouse.spent)}
          bar="#FF6B6B"
        />
        <Kpi
          label="на складе"
          value={format_rub(warehouse.on_hand)}
          sub="остатки по цене закупки"
          bar="#8B9DC3"
        />
      </div>

      <Card
        title="динамика выручки, чистой и стаканов"
        hint={`по дням · ${period}${
          cups_period > 0
            ? ` · ${cups_period} стаканов (комбо разложены) · ср. ${cups_avg_day.toFixed(1)}/день`
            : ''
        }`}
      >
        {chart.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={chart.length > 16 ? 1 : 0} />
                <YAxis
                  yAxisId="rub"
                  tick={{ fontSize: 11 }}
                  width={56}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}к`}
                />
                <YAxis
                  yAxisId="cups"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  width={36}
                  allowDecimals={false}
                  tickFormatter={(v) => String(Math.round(Number(v)))}
                />
                <Tooltip
                  formatter={(v, name) =>
                    name === 'стаканы'
                      ? [`${Math.round(Number(v))} шт`, 'стаканы']
                      : [format_rub(Number(v)), String(name)]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="rub" dataKey="выручка" fill="#FF6B6B" radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="rub"
                  type="monotone"
                  dataKey="прибыль"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="cups"
                  type="monotone"
                  dataKey="стаканы"
                  stroke="#2A9D8F"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState>нет данных</EmptyState>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <StoreRhythmCard rhythm={fact?.rhythm} period={period} />

        <Card
          title={`структура выручки · ${period}`}
          hint={mix_with_cogs ? 'маржа: выручка − себестоимость техкарты' : 'выручка без учёта себестоимости'}
          actions={
            <div className="flex gap-0.5 rounded-full bg-neutral-100 p-0.5">
              {(
                [
                  [false, 'без себест.'],
                  [true, 'с себест.'],
                ] as const
              ).map(([on, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set_mix_with_cogs(on)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    mix_with_cogs === on ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
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
                    <Tooltip
                      formatter={(v, _n, item) => {
                        const row = item?.payload as { revenue?: number; cost?: number } | undefined;
                        if (mix_with_cogs && row) {
                          return [
                            `${format_rub(Number(v))} (выр. ${format_rub(row.revenue ?? 0)} − ${format_rub(row.cost ?? 0)})`,
                            'маржа',
                          ];
                        }
                        return [format_rub(Number(v)), 'выручка'];
                      }}
                    />
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
                      {mix_with_cogs ? (
                        <span className="mt-0.5 block text-[10px] tabular-nums text-neutral-300">
                          {format_rub(r.revenue)} − {format_rub(r.cost)}
                        </span>
                      ) : null}
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

