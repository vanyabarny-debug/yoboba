/**
 * Цель → выручка/микс → roadmap 3–12 мес.
 * Считает от реальных COGS, opex, налога и факта продаж — без фантазийного микса.
 */
import type { store_rhythm } from '@/lib/customer-analytics';
import type { menu_item } from '@/lib/types';
import {
  add_month,
  amortization_per_month,
  break_even_revenue,
  compute_month_tax,
  days_in_month,
  injury_monthly_of,
  menu_price_for_size,
  month_label,
  moscow_today,
  resolve_month_opex,
  resolve_month_payroll,
  salary_opex_id,
  tax_regime_of,
  tech_card_cost,
  custom_business_tax,
  custom_taxes_of,
  type business_plan,
  type finance_state,
  type plan_horizon,
  type plan_reinvest_split,
  type plan_strategy_id,
  type sales_cell,
  DEFAULT_REINVEST_SPLIT,
  default_business_plan,
} from '@/lib/finance/model';

const FEASIBILITY_RANK: Record<roadmap_feasibility, number> = {
  unreachable: 0,
  stretch: 1,
  ok: 2,
  easy: 3,
};

/**
 * Если техкарты недозаполнены, рецепт даёт маржу 85–95% и «нужная выручка»
 * получается сказкой. Для планирования режем потолок — типичный бабл ~55–65%.
 */
const PLANNING_MAX_GROSS_MARGIN = 0.62;
/** если по рецепту себес < 15% цены — считаем рецепт дырявым */
const THIN_RECIPE_COST_RATIO = 0.15;

export type plan_sku_row = {
  tech_card_id: string;
  size_key: string;
  name: string;
  price: number;
  unit_cost: number;
  /** вес в миксе до tilt (доля выручки 0–1) */
  weight: number;
  fact_qty: number;
  fact_revenue: number;
  margin_pct: number;
};

export type plan_mix_cell = {
  tech_card_id: string;
  size_key: string;
  price: number;
  qty: number;
  unit_cost: number;
  revenue: number;
  cogs: number;
};

export type month_solve = {
  revenue: number;
  cogs: number;
  tax: number;
  net: number;
  drinks: number;
  cups_per_day: number;
  gross_margin_pct: number;
  cells: plan_mix_cell[];
  reachable: boolean;
};

export type roadmap_feasibility = 'easy' | 'ok' | 'stretch' | 'unreachable';

export type roadmap_month = {
  month: string;
  /** индекс 0..n-1 */
  index: number;
  target_net: number;
  /** прогноз ёмкости: старт × рост % (не обещание) */
  capacity_revenue: number;
  /** стаканов/день при этой ёмкости */
  capacity_cups_day: number;
  solve: month_solve;
  owner_take: number;
  reinvest_total: number;
  reinvest: {
    marketing: number;
    equipment: number;
    stock: number;
    reserve: number;
  };
  feasibility: roadmap_feasibility;
  /** множитель к baseline (трафик × чек), уже с потолком */
  growth_factor: number;
};

export type plan_baseline = {
  rows: plan_sku_row[];
  /** маржа по рецепту (может быть завышена) */
  recipe_margin_pct: number;
  /** маржа для солвера (с потолком, если рецепт тонкий) */
  gross_margin_pct: number;
  /** сырой факт за выбранный месяц (может быть MTD) */
  fact_revenue: number;
  /** ёмкость полного месяца: max(экстраполяция MTD, прошлый месяц) */
  capacity_revenue: number;
  fact_drinks: number;
  fact_cups_per_day: number;
  /** доля фиксов точки (0–1) */
  spot_share: number;
  fixed_opex: number;
  fixed_ndfl: number;
  fixed_insurance: number;
  fixed_amort: number;
  fixed_total: number;
  break_even: number;
  /** откуда взяли ёмкость */
  capacity_source: 'projected' | 'previous' | 'full_month' | 'break_even' | 'assumed' | 'none';
  /** ёмкость только из факта (без твоей оценки стаканов/день) */
  fact_capacity_revenue: number;
  margin_capped: boolean;
};

export type strategy_preset = {
  id: Exclude<plan_strategy_id, 'custom'>;
  label: string;
  hint: string;
  reinvestPct: number;
  reinvestSplit: plan_reinvest_split;
  trafficGrowthPct: number;
  ticketGrowthPct: number;
  mixTiltPct: number;
};

export const STRATEGY_PRESETS: strategy_preset[] = [
  {
    id: 'launch',
    label: 'запуск',
    hint: 'точка новая — узнаваемость через рекламу, реинвест маленький',
    reinvestPct: 15,
    reinvestSplit: { marketing: 70, equipment: 10, stock: 10, reserve: 10 },
    trafficGrowthPct: 5,
    ticketGrowthPct: 1,
    mixTiltPct: 5,
  },
  {
    id: 'conservative',
    label: 'себе',
    hint: 'реинвест минимум, почти всё себе',
    reinvestPct: 0,
    reinvestSplit: { marketing: 40, equipment: 20, stock: 20, reserve: 20 },
    trafficGrowthPct: 2,
    ticketGrowthPct: 0.5,
    mixTiltPct: 3,
  },
  {
    id: 'balanced',
    label: 'баланс',
    hint: 'рост без перегиба',
    reinvestPct: 30,
    reinvestSplit: { ...DEFAULT_REINVEST_SPLIT },
    trafficGrowthPct: 3,
    ticketGrowthPct: 1,
    mixTiltPct: 5,
  },
  {
    id: 'growth',
    label: 'рост',
    hint: 'много в рекламу и развитие (не путать с «на руки»)',
    reinvestPct: 55,
    reinvestSplit: { marketing: 55, equipment: 15, stock: 15, reserve: 15 },
    trafficGrowthPct: 5,
    ticketGrowthPct: 1.5,
    mixTiltPct: 10,
  },
];

/** потолок: ёмкость за горизонт не больше чем × к старту (иначе «лям к концу года» из % роста) */
const MAX_CAPACITY_MULT = 2.2;

export function next_month_id(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prev_month_id(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** MTD → полный месяц; для закрытого месяца возвращает как есть */
export function project_full_month_revenue(
  mtd_revenue: number,
  month: string,
  today_ymd = moscow_today()
): number {
  if (!(mtd_revenue > 0)) return 0;
  const dim = days_in_month(month);
  if (!today_ymd.startsWith(month)) return Math.round(mtd_revenue);
  const day_num = Number(today_ymd.slice(8));
  const elapsed = Math.max(1, Math.min(dim, Number.isFinite(day_num) ? day_num : 1));
  // в первые дни не раздуваем слишком агрессивно
  const factor = dim / elapsed;
  const capped = elapsed <= 3 ? Math.min(factor, 4) : factor;
  return Math.round(mtd_revenue * capped);
}

export function planning_gross_margin(recipe_gm: number): { gm: number; capped: boolean } {
  if (!(recipe_gm > 0) || !Number.isFinite(recipe_gm)) return { gm: 0.5, capped: true };
  if (recipe_gm > PLANNING_MAX_GROSS_MARGIN) {
    return { gm: PLANNING_MAX_GROSS_MARGIN, capped: true };
  }
  return { gm: recipe_gm, capped: false };
}

/** слить два микса: приоритет у primary, добираем весами из secondary */
export function merge_fact_sales(
  primary: Record<string, Record<string, sales_cell>>,
  secondary: Record<string, Record<string, sales_cell>>
): Record<string, Record<string, sales_cell>> {
  const out: Record<string, Record<string, sales_cell>> = {};
  const ids = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
  for (const tc of ids) {
    const sizes = new Set([
      ...Object.keys(primary[tc] ?? {}),
      ...Object.keys(secondary[tc] ?? {}),
    ]);
    out[tc] = {};
    for (const size of sizes) {
      const a = primary[tc]?.[size];
      const b = secondary[tc]?.[size];
      const qty = (a?.qty ?? 0) + (b?.qty ?? 0);
      if (qty <= 0 && !(a?.price || b?.price)) continue;
      const rev = (a?.qty ?? 0) * (a?.price ?? 0) + (b?.qty ?? 0) * (b?.price ?? 0);
      const price = qty > 0 ? Math.round(rev / qty) : a?.price || b?.price || 0;
      out[tc][size] = { qty, price };
    }
  }
  return out;
}

export function month_ids_ahead(start: string, count: number): string[] {
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = next_month_id(cur);
  }
  return out;
}

function fixed_costs_for_month(
  state: finance_state,
  month: string,
  spot_share: number
): { opex: number; ndfl: number; insurance: number; amort: number; total: number } {
  const md = state.monthsData.find((m) => m.month === month);
  const share = Math.min(1, Math.max(0, spot_share));
  if (!md) {
    const amort = amortization_per_month(state) * share;
    return { opex: 0, ndfl: 0, insurance: injury_monthly_of(state) * share, amort, total: amort };
  }
  const resolved_opex = resolve_month_opex(state, month);
  const pay = resolve_month_payroll(state, { ...md, opex: resolved_opex });
  let opex = 0;
  for (const val of Object.values(resolved_opex)) opex += Number(val) || 0;
  if (Array.isArray(md.payroll) && md.payroll.length) {
    const sid = salary_opex_id(state);
    opex += pay.net - (Number(resolved_opex[sid]) || 0);
  }
  const amort = amortization_per_month(state);
  const regime = tax_regime_of(state);
  const patent = regime.kind === 'patent' ? Number(state.taxPatentMonthly) || 0 : 0;
  const custom_fixed =
    regime.id === 'custom'
      ? custom_business_tax(
          custom_taxes_of(state).filter((t) => t.basis === 'fixed'),
          0,
          0
        )
      : 0;
  const insurance = pay.insurance + injury_monthly_of(state) + patent + custom_fixed;
  return {
    opex: opex * share,
    ndfl: pay.ndfl * share,
    insurance: insurance * share,
    amort: amort * share,
    total: (opex + pay.ndfl + insurance + amort) * share,
  };
}

export function spot_revenue_share(
  by_spot: { spot_id: string | null; revenue: number }[] | undefined,
  spot_id: string
): number {
  // при фильтре ?spot_id= API уже отдал только эту точку — долю не режем
  if (!spot_id || !by_spot?.length) return 1;
  if (by_spot.length === 1 && by_spot[0]?.spot_id === spot_id) return 1;
  const total = by_spot.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  if (total <= 0) return 1;
  const mine = by_spot.find((r) => r.spot_id === spot_id);
  if (!mine) return 1;
  return Math.min(1, Math.max(0, mine.revenue / total));
}

export function build_baseline(input: {
  state: finance_state;
  month: string;
  fact_sales: Record<string, Record<string, sales_cell>>;
  fact_revenue: number;
  menu: menu_item[];
  spot_share?: number;
  rhythm?: store_rhythm | null;
  days?: number;
  /** выручка прошлого полного месяца — пол для ёмкости */
  prev_month_revenue?: number;
  /** микс прошлого месяца, если текущий пустой/тонкий */
  prev_fact_sales?: Record<string, Record<string, sales_cell>>;
  /** твоя оценка: сколько стаканов/день реально при рекламе/узнаваемости */
  assumed_cups_per_day?: number;
}): plan_baseline {
  const { state, month, menu } = input;
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  const share = input.spot_share ?? 1;
  const days = Math.max(1, input.days ?? days_in_month(month));

  const current_drinks = Object.values(input.fact_sales).reduce(
    (s, by_size) => s + Object.values(by_size).reduce((a, c) => a + (c?.qty ?? 0), 0),
    0
  );
  // микс: если в текущем месяце мало продаж — опираемся на прошлый
  const fact_sales =
    current_drinks >= 10 || !input.prev_fact_sales
      ? input.fact_sales
      : merge_fact_sales(input.fact_sales, input.prev_fact_sales);

  const rows: plan_sku_row[] = [];
  let fact_drinks = 0;
  let fact_rev_from_mix = 0;
  let recipe_cogs_on_fact = 0;

  for (const card of state.techCards) {
    const item = card.menu_item_id ? menu_by_id.get(card.menu_item_id) : undefined;
    if (!item || !item.is_available) continue;
    for (const size_key of Object.keys(card.sizes)) {
      const f = fact_sales[card.id]?.[size_key];
      const fact_qty = f?.qty ?? 0;
      const price =
        f?.price && f.price > 0
          ? f.price
          : menu_price_for_size(item, size_key) || 0;
      const unit_cost = tech_card_cost(state, card, size_key);
      const cell_rev = fact_qty * (f?.price && f.price > 0 ? f.price : price);
      if (fact_qty <= 0 && price <= 0) continue;
      fact_drinks += fact_qty;
      fact_rev_from_mix += cell_rev;
      recipe_cogs_on_fact += fact_qty * unit_cost;
      rows.push({
        tech_card_id: card.id,
        size_key,
        name: card.name,
        price,
        unit_cost,
        weight: 0,
        fact_qty,
        fact_revenue: cell_rev,
        margin_pct: price > 0 ? Math.max(0, (price - unit_cost) / price) : 0,
      });
    }
  }

  // веса только по тому, что реально продавалось; иначе — по ценам
  const sold = rows.filter((r) => r.fact_qty > 0);
  const weight_rows = sold.length ? sold : rows;
  const weight_base = sold.length
    ? sold.reduce((s, r) => s + r.fact_revenue, 0)
    : rows.reduce((s, r) => s + Math.max(0, r.price), 0);
  for (const r of rows) {
    if (sold.length) r.weight = weight_base > 0 ? r.fact_revenue / weight_base : 0;
    else r.weight = weight_base > 0 ? Math.max(0, r.price) / weight_base : 0;
  }

  const usable = rows.filter((r) => r.weight > 0 && r.price > 0);
  const recipe_margin_pct =
    usable.length > 0
      ? usable.reduce((s, r) => s + r.weight * r.margin_pct, 0)
      : fact_rev_from_mix > 0
        ? Math.max(0, 1 - recipe_cogs_on_fact / fact_rev_from_mix)
        : 0;

  const cost_ratio_on_fact =
    fact_rev_from_mix > 0 ? recipe_cogs_on_fact / fact_rev_from_mix : 1 - recipe_margin_pct;
  const thin_recipe = cost_ratio_on_fact < THIN_RECIPE_COST_RATIO || recipe_margin_pct > PLANNING_MAX_GROSS_MARGIN;
  const { gm: gross_margin_pct, capped: margin_capped } = planning_gross_margin(
    thin_recipe ? Math.min(recipe_margin_pct, PLANNING_MAX_GROSS_MARGIN) : recipe_margin_pct
  );

  // фиксы не режем долей точки, если смотрим одну точку (доля=1) —
  // opex в модели глобальный и относится к работе точки целиком
  const fixed = fixed_costs_for_month(state, month, share);
  const raw_fact = input.fact_revenue > 0 ? input.fact_revenue : fact_rev_from_mix;
  const projected = project_full_month_revenue(raw_fact, month);
  const prev_rev = Math.max(0, Number(input.prev_month_revenue) || 0);
  const today = moscow_today();
  const is_current_month = today.startsWith(month);

  let capacity_revenue = 0;
  let capacity_source: plan_baseline['capacity_source'] = 'none';
  if (is_current_month && projected > 0 && prev_rev > 0) {
    capacity_revenue = Math.max(projected, prev_rev);
    capacity_source = projected >= prev_rev ? 'projected' : 'previous';
  } else if (is_current_month && projected > 0) {
    capacity_revenue = projected;
    capacity_source = 'projected';
  } else if (prev_rev > 0 && (!raw_fact || is_current_month)) {
    capacity_revenue = Math.max(projected, prev_rev);
    capacity_source = prev_rev >= projected ? 'previous' : 'projected';
  } else if (raw_fact > 0 && !is_current_month) {
    capacity_revenue = raw_fact;
    capacity_source = 'full_month';
  } else if (projected > 0) {
    capacity_revenue = projected;
    capacity_source = 'projected';
  }

  const fact_cups_per_day =
    capacity_revenue > 0 && raw_fact > 0 && fact_drinks > 0
      ? (fact_drinks * (capacity_revenue / raw_fact)) / days
      : fact_drinks / days;

  const fact_capacity_revenue = capacity_revenue;

  // средний чек: из факта или из микса цен
  const avg_check =
    fact_drinks > 0 && raw_fact > 0
      ? raw_fact / fact_drinks
      : usable.length > 0
        ? usable.reduce((s, r) => s + r.weight * r.price, 0)
        : 350;

  const assumed = Math.max(0, Number(input.assumed_cups_per_day) || 0);
  if (assumed > 0 && avg_check > 0) {
    const assumed_rev = Math.round(assumed * days * avg_check);
    if (assumed_rev > capacity_revenue) {
      capacity_revenue = assumed_rev;
      capacity_source = 'assumed';
    }
  }

  const be = break_even_revenue(state, month, { margin_pct: gross_margin_pct }) * share;
  if (capacity_revenue <= 0 && be > 0) {
    capacity_revenue = be;
    capacity_source = 'break_even';
  }

  return {
    rows: usable.length ? usable : weight_rows.filter((r) => r.price > 0),
    recipe_margin_pct,
    gross_margin_pct,
    fact_revenue: raw_fact,
    capacity_revenue,
    fact_capacity_revenue,
    fact_drinks,
    fact_cups_per_day,
    spot_share: share,
    fixed_opex: fixed.opex,
    fixed_ndfl: fixed.ndfl,
    fixed_insurance: fixed.insurance,
    fixed_amort: fixed.amort,
    fixed_total: fixed.total,
    break_even: be,
    capacity_source,
    margin_capped: margin_capped || thin_recipe,
  };
}

/** наклон весов к более маржинальным SKU; sum(weights) = 1 */
export function tilt_weights(rows: plan_sku_row[], tilt_pct: number): number[] {
  const n = rows.length;
  if (!n) return [];
  const base = rows.map((r) => Math.max(1e-9, r.weight));
  const base_sum = base.reduce((a, b) => a + b, 0);
  const norm = base.map((w) => w / base_sum);

  const t = Math.min(15, Math.max(0, tilt_pct)) / 100;
  if (t <= 0) return norm;

  const margins = rows.map((r) => r.margin_pct);
  const avg = margins.reduce((a, b) => a + b, 0) / n;
  const boosted = norm.map((w, i) => {
    const delta = margins[i] - avg;
    return Math.max(1e-9, w * (1 + t * delta * 4));
  });
  const s = boosted.reduce((a, b) => a + b, 0);
  return boosted.map((w) => w / s);
}

function net_at_revenue(
  state: finance_state,
  revenue: number,
  cogs: number,
  fixed: { opex: number; ndfl: number; insurance: number; amort: number }
): { net: number; tax: number } {
  const deductible = cogs + fixed.opex;
  const tax = compute_month_tax(state, revenue, deductible);
  const ebitda = revenue - cogs - fixed.opex;
  const net = ebitda - fixed.amort - tax - fixed.ndfl - fixed.insurance;
  return { net, tax };
}

/** бинарный поиск выручки под целевую чистую при заданной валовой марже */
export function solve_revenue_for_net(
  state: finance_state,
  target_net: number,
  gross_margin_pct: number,
  fixed: { opex: number; ndfl: number; insurance: number; amort: number }
): { revenue: number; cogs: number; tax: number; net: number; reachable: boolean } {
  const gm = Math.min(0.95, Math.max(0.01, gross_margin_pct));
  const at0 = net_at_revenue(state, 0, 0, fixed);
  if (target_net <= at0.net) {
    return { revenue: 0, cogs: 0, tax: at0.tax, net: at0.net, reachable: true };
  }

  let lo = 0;
  let hi = Math.max(fixed.opex + fixed.amort + target_net, 50_000) * 4;
  // расширяем верх, пока net(hi) < target
  for (let i = 0; i < 20; i++) {
    const cogs = hi * (1 - gm);
    const { net } = net_at_revenue(state, hi, cogs, fixed);
    if (net >= target_net) break;
    hi *= 2;
    if (hi > 5e9) break;
  }

  const hi_net = net_at_revenue(state, hi, hi * (1 - gm), fixed).net;
  if (hi_net < target_net - 1) {
    // contribution слишком мал (налог ≈ маржа)
    return {
      revenue: hi,
      cogs: hi * (1 - gm),
      tax: net_at_revenue(state, hi, hi * (1 - gm), fixed).tax,
      net: hi_net,
      reachable: false,
    };
  }

  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const cogs = mid * (1 - gm);
    const { net } = net_at_revenue(state, mid, cogs, fixed);
    if (net < target_net) lo = mid;
    else hi = mid;
  }

  const revenue = Math.round(hi);
  const cogs = Math.round(revenue * (1 - gm));
  const { net, tax } = net_at_revenue(state, revenue, cogs, fixed);
  return { revenue, cogs, tax: Math.round(tax), net: Math.round(net), reachable: true };
}

export function allocate_mix(
  rows: plan_sku_row[],
  weights: number[],
  target_revenue: number
): plan_mix_cell[] {
  const cells: plan_mix_cell[] = [];
  if (!rows.length || target_revenue <= 0) return cells;

  let allocated_rev = 0;
  let allocated_cogs = 0;
  const draft: { row: plan_sku_row; w: number; qty: number; revenue: number; cogs: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const w = weights[i] ?? 0;
    if (w <= 0 || row.price <= 0) continue;
    const revenue = target_revenue * w;
    const qty = Math.max(0, Math.round(revenue / row.price));
    const rev = qty * row.price;
    const cogs = qty * row.unit_cost;
    draft.push({ row, w, qty, revenue: rev, cogs });
    allocated_rev += rev;
    allocated_cogs += cogs;
  }

  // добрать 1–2 стакана на самый весомый SKU, если округление недобрало
  if (draft.length && allocated_rev < target_revenue * 0.98) {
    const top = [...draft].sort((a, b) => b.w - a.w)[0];
    const need = target_revenue - allocated_rev;
    const add = Math.max(0, Math.round(need / top.row.price));
    if (add > 0) {
      top.qty += add;
      top.revenue += add * top.row.price;
      top.cogs += add * top.row.unit_cost;
      allocated_rev += add * top.row.price;
      allocated_cogs += add * top.row.unit_cost;
    }
  }

  for (const d of draft) {
    cells.push({
      tech_card_id: d.row.tech_card_id,
      size_key: d.row.size_key,
      price: d.row.price,
      qty: d.qty,
      unit_cost: d.row.unit_cost,
      revenue: d.revenue,
      cogs: d.cogs,
    });
  }
  return cells;
}

export function solve_month(input: {
  state: finance_state;
  baseline: plan_baseline;
  target_net: number;
  mix_tilt_pct: number;
  days?: number;
  /** множитель цен (рост чека) */
  price_factor?: number;
}): month_solve {
  const { state, baseline, target_net } = input;
  const days = Math.max(1, input.days ?? 30);
  const price_factor = Math.max(0.5, input.price_factor ?? 1);

  const rows = baseline.rows.map((r) => ({
    ...r,
    price: Math.round(r.price * price_factor),
    margin_pct:
      r.price * price_factor > 0
        ? (r.price * price_factor - r.unit_cost) / (r.price * price_factor)
        : 0,
  }));

  const weights = tilt_weights(rows, input.mix_tilt_pct);
  const recipe_gm =
    rows.length > 0
      ? rows.reduce((s, r, i) => s + (weights[i] ?? 0) * r.margin_pct, 0)
      : baseline.recipe_margin_pct || baseline.gross_margin_pct;
  // не даём солверу верить в сказочную маржу по дырявым техкартам
  const gm = baseline.margin_capped
    ? Math.min(recipe_gm, baseline.gross_margin_pct)
    : planning_gross_margin(recipe_gm).gm;

  const fixed = {
    opex: baseline.fixed_opex,
    ndfl: baseline.fixed_ndfl,
    insurance: baseline.fixed_insurance,
    amort: baseline.fixed_amort,
  };

  const solved = solve_revenue_for_net(state, target_net, gm, fixed);
  const cells = allocate_mix(rows, weights, solved.revenue);
  const drinks = cells.reduce((s, c) => s + c.qty, 0);
  const revenue = cells.reduce((s, c) => s + c.revenue, 0) || solved.revenue;
  const cogs = cells.reduce((s, c) => s + c.cogs, 0) || solved.cogs;
  const { net, tax } = net_at_revenue(state, revenue, cogs, fixed);

  return {
    revenue: Math.round(revenue),
    cogs: Math.round(cogs),
    tax: Math.round(tax),
    net: Math.round(net),
    drinks,
    cups_per_day: drinks / days,
    gross_margin_pct: gm,
    cells,
    reachable: solved.reachable && (rows.length > 0 || target_net <= 0),
  };
}

function split_reinvest(total: number, split: plan_reinvest_split) {
  const sum = split.marketing + split.equipment + split.stock + split.reserve;
  const s = sum > 0 ? sum : 100;
  return {
    marketing: Math.round((total * split.marketing) / s),
    equipment: Math.round((total * split.equipment) / s),
    stock: Math.round((total * split.stock) / s),
    reserve: Math.round((total * split.reserve) / s),
  };
}

export function feasibility_of(
  required_revenue: number,
  capacity_revenue: number,
  reachable: boolean,
  opts?: { capacity_source?: plan_baseline['capacity_source'] }
): roadmap_feasibility {
  if (!reachable) return 'unreachable';
  if (required_revenue <= 0) return 'easy';
  // нет продаж и даже BE — не орём «недостижимо», а «натянуто / нет базы»
  if (capacity_revenue <= 0) return 'stretch';
  if (opts?.capacity_source === 'break_even') {
    // сравниваем с безубыточностью, а не с фактом
    const ratio = required_revenue / Math.max(1, capacity_revenue);
    if (ratio <= 1.1) return 'ok';
    if (ratio <= 1.4) return 'stretch';
    return 'unreachable';
  }
  const ratio = required_revenue / Math.max(1, capacity_revenue);
  if (ratio <= 0.85) return 'easy';
  if (ratio <= 1.1) return 'ok';
  if (ratio <= 1.4) return 'stretch';
  return 'unreachable';
}

export const FEASIBILITY_LABEL: Record<roadmap_feasibility, string> = {
  easy: 'с запасом',
  ok: 'реально',
  stretch: 'натянуто',
  unreachable: 'недостижимо',
};

export const CAPACITY_SOURCE_HINT: Record<plan_baseline['capacity_source'], string> = {
  projected: 'ёмкость = экстраполяция текущего месяца на полный',
  previous: 'ёмкость = прошлый полный месяц',
  full_month: 'ёмкость = факт выбранного месяца',
  break_even: 'нет продаж — ориентир по безубыточности',
  assumed: 'ёмкость = твоя оценка стаканов/день × средний чек (запуск / реклама)',
  none: 'нет базы продаж',
};

export type plan_lever = {
  id: string;
  title: string;
  detail: string;
  /** насколько это закрывает gap выручки, грубо 0–1+ */
  impact: number;
};

export type plan_verdict = {
  /** главный статус для шапки: по горизонту, не только по текущему месяцу */
  feasibility: roadmap_feasibility;
  /** статус выбранного/первого месяца */
  this_month_feasibility: roadmap_feasibility;
  /** коротко: почему такой статус */
  why: string;
  /** подзаголовок: этот месяц vs горизонт */
  horizon_note: string;
  /** первый месяц, где статус ok/easy; null если не дотягиваем */
  first_ok_month: string | null;
  first_ok_label: string | null;
  /** нужно по цели */
  need_revenue: number;
  need_cups_day: number;
  need_net: number;
  /** объективно при текущей ёмкости (выбранный месяц) */
  can_revenue: number;
  can_cups_day: number;
  can_net: number;
  /** прогноз ёмкости в конце горизонта */
  end_capacity_revenue: number;
  gap_revenue: number;
  /** во сколько раз надо вырасти к ёмкости */
  growth_needed_pct: number;
  /** через сколько месяцев при текущем росте трафик×чек ёмкость догонит цель (null = не догонит за горизонт) */
  months_to_reach: number | null;
  levers: plan_lever[];
};

/** чистая при заданной выручке и марже baseline */
export function net_at_capacity(
  state: finance_state,
  baseline: plan_baseline,
  revenue: number
): { net: number; tax: number; cogs: number } {
  const gm = Math.max(0.01, Math.min(0.95, baseline.gross_margin_pct));
  const cogs = Math.round(revenue * (1 - gm));
  const fixed = {
    opex: baseline.fixed_opex,
    ndfl: baseline.fixed_ndfl,
    insurance: baseline.fixed_insurance,
    amort: baseline.fixed_amort,
  };
  const { net, tax } = net_at_revenue(state, revenue, cogs, fixed);
  return { net: Math.round(net), tax: Math.round(tax), cogs };
}

function months_until_capacity(
  need: number,
  base_cap: number,
  traffic_pct: number,
  ticket_pct: number,
  horizon: number
): number | null {
  if (!(need > 0)) return 0;
  if (!(base_cap > 0)) return null;
  if (base_cap >= need) return 0;
  const monthly = (1 + traffic_pct / 100) * (1 + ticket_pct / 100);
  if (monthly <= 1) return null;
  let cap = base_cap;
  for (let m = 1; m <= Math.max(horizon, 24); m++) {
    cap *= monthly;
    if (cap >= need) return m;
  }
  return null;
}

/** вердикт: нужно vs можно + рычаги; шапка смотрит на весь горизонт */
export function build_plan_verdict(input: {
  state: finance_state;
  baseline: plan_baseline;
  plan: business_plan;
  row: roadmap_month;
  roadmap?: roadmap_month[];
  days?: number;
}): plan_verdict {
  const { state, baseline, plan, row } = input;
  const roadmap = input.roadmap?.length ? input.roadmap : [row];
  const days = Math.max(1, input.days ?? days_in_month(row.month));
  const need_revenue = row.solve.revenue;
  const can_revenue = Math.round(row.capacity_revenue);
  const can = net_at_capacity(state, baseline, can_revenue);
  const avg_check =
    baseline.fact_drinks > 0 && baseline.fact_revenue > 0
      ? baseline.fact_revenue / baseline.fact_drinks
      : need_revenue > 0 && row.solve.drinks > 0
        ? need_revenue / row.solve.drinks
        : 350;
  const can_cups_day = avg_check > 0 ? can_revenue / avg_check / days : 0;
  const gap = Math.max(0, need_revenue - can_revenue);
  const growth_needed_pct =
    can_revenue > 0 ? Math.round(((need_revenue / can_revenue) - 1) * 1000) / 10 : need_revenue > 0 ? 999 : 0;

  const months_to_reach = months_until_capacity(
    need_revenue,
    baseline.capacity_revenue,
    plan.trafficGrowthPct,
    plan.ticketGrowthPct,
    plan.horizonMonths
  );

  const first_ok =
    roadmap.find((r) => r.feasibility === 'ok' || r.feasibility === 'easy') ?? null;
  const best_in_horizon = roadmap.reduce(
    (best, r) => (FEASIBILITY_RANK[r.feasibility] > FEASIBILITY_RANK[best] ? r.feasibility : best),
    'unreachable' as roadmap_feasibility
  );
  const end_row = roadmap[roadmap.length - 1] ?? row;
  const end_capacity_revenue = Math.round(end_row.capacity_revenue);

  // главный статус: если за горизонт цель становится ok/easy — это и показываем
  const horizon_feasibility: roadmap_feasibility =
    plan.horizonMonths > 1 && first_ok
      ? first_ok.feasibility
      : plan.horizonMonths > 1
        ? best_in_horizon
        : row.feasibility;

  const this_month_feasibility = row.feasibility;
  const first_ok_month = first_ok?.month ?? null;
  const first_ok_label = first_ok ? month_label(first_ok.month) : null;

  let horizon_note = '';
  if (plan.horizonMonths <= 1) {
    horizon_note = '';
  } else if (first_ok && this_month_feasibility !== 'ok' && this_month_feasibility !== 'easy') {
    horizon_note = `этот месяц: ${FEASIBILITY_LABEL[this_month_feasibility]} · с ${first_ok_label}: ${FEASIBILITY_LABEL[first_ok.feasibility]}`;
  } else if (first_ok) {
    horizon_note = `в горизонте ${plan.horizonMonths} мес. цель уже в зоне «${FEASIBILITY_LABEL[first_ok.feasibility]}» с ${first_ok_label}`;
  } else if (best_in_horizon === 'stretch') {
    horizon_note = `за ${plan.horizonMonths} мес. максимум «натянуто» — к концу прогноз ~${format_gap(end_capacity_revenue)}`;
  } else {
    horizon_note = `за ${plan.horizonMonths} мес. при текущем % роста цель не догоняется (к концу ~${format_gap(end_capacity_revenue)})`;
  }

  let why = '';
  if (!row.solve.reachable) {
    why =
      'при текущей марже и налогах цель чистой математически не сходится — слишком тонкая contribution после налога';
  } else if (baseline.capacity_source === 'none' || (can_revenue <= 0 && !first_ok)) {
    why =
      'нет базы: укажи «сколько стаканов/день реально могу» (для новой точки) или дождись продаж — иначе не с чем сравнить';
  } else if (first_ok && plan.horizonMonths > 1) {
    why = `на горизонте ${plan.horizonMonths} мес. цель достижима с ${first_ok_label}. сейчас разрыв ${format_gap(gap)} — первые месяцы ещё ниже прогноза ёмкости, это нормально для плана на год`;
  } else if (row.feasibility === 'unreachable') {
    why =
      baseline.capacity_source === 'assumed'
        ? `даже при твоей оценке (~${plan.assumedCupsPerDay} шт/день → ${format_gap(can_revenue)}) до цели не хватает ${format_gap(gap)}. снизь цель чистой, подними оценку стаканов или режь фиксы`
        : `нужно ~${format_gap(need_revenue)}, а ёмкость ~${format_gap(can_revenue)} (×${(need_revenue / Math.max(1, can_revenue)).toFixed(1)}). для новой точки факт ${baseline.fact_cups_per_day.toFixed(0)} шт/день — не потолок: задай оценку после рекламы`;
  } else if (row.feasibility === 'stretch') {
    why = `цель выше ёмкости на ~${format_gap(gap)} (~${growth_needed_pct}%). можно через трафик/чек/рекламу или чуть снизить цель`;
  } else if (row.feasibility === 'ok') {
    why = `нужна выручка близка к ёмкости (${format_gap(need_revenue)} vs ${format_gap(can_revenue)}) — при заявленном ритме реально`;
  } else {
    why = `ёмкость ${format_gap(can_revenue)} с запасом покрывает нужные ${format_gap(need_revenue)}`;
  }

  const levers: plan_lever[] = [];
  if (gap > 0) {
    const need_cups = row.solve.cups_per_day;
    const fact_cups = baseline.fact_cups_per_day;
    const cups_gap = Math.max(0, need_cups - Math.max(can_cups_day, fact_cups));

    if (plan.assumedCupsPerDay <= 0 && fact_cups > 0 && fact_cups < 12) {
      const suggest = Math.max(15, Math.ceil(need_cups));
      levers.push({
        id: 'assumed',
        title: `задай «реально могу» ${Math.min(suggest, 40)} шт/день`,
        detail: `сейчас факт ~${fact_cups.toFixed(0)}/день (точка только раскачивается). для города часто реалистично 15–25 при рекламе — без этого план думает, что 7 стаканов это потолок`,
        impact: 1.5,
      });
    }

    if (cups_gap > 0.5) {
      const from = Math.max(can_cups_day, fact_cups);
      const lift_pct = from > 0 ? Math.round((need_cups / from - 1) * 100) : 100;
      levers.push({
        id: 'traffic',
        title: `выйти на ~${need_cups.toFixed(0)} шт/день (сейчас ~${from.toFixed(0)})`,
        detail:
          lift_pct > 100
            ? `это ×${(need_cups / Math.max(0.1, from)).toFixed(1)} к текущему ритму — для новой точки нормально через рекламу и сарафан, не «+5% в месяц»`
            : `примерно +${lift_pct}% к трафику: карта, таргет, вывеска, точка входа`,
        impact: Math.min(2, lift_pct / 50),
      });
    }

    levers.push({
      id: 'ticket',
      title: 'средний чек +10–25%',
      detail: 'апселл топпингов, комбо, размер L, сырная пенка — без роста очереди',
      impact: 0.35,
    });

    if (plan.reinvestPct > 0) {
      levers.push({
        id: 'reinvest_zero',
        title: 'реинвест можно 0%',
        detail: `сейчас ${Math.round(plan.reinvestPct)}% чистой уходит в развитие. пресет «себе» или ползунок на 0 — если хочешь сначала забирать прибыль, а рекламу считать отдельно`,
        impact: 0.25,
      });
    }

    if (baseline.fixed_total > 0) {
      const save = Math.min(baseline.fixed_total * 0.15, gap * baseline.gross_margin_pct);
      if (save > 500) {
        levers.push({
          id: 'fixed',
          title: `резать фиксы ~${Math.round(save).toLocaleString('ru-RU')} ₽`,
          detail: `аренда/ФОТ/прочее сейчас ${Math.round(baseline.fixed_total).toLocaleString('ru-RU')} ₽`,
          impact: save / Math.max(1, gap),
        });
      }
    }
    const high_margin = [...baseline.rows].sort((a, b) => b.margin_pct - a.margin_pct).slice(0, 2);
    if (high_margin.length && plan.mixTiltPct < 12) {
      levers.push({
        id: 'mix',
        title: 'сдвинуть микс к марже',
        detail: `сильнее пушить: ${high_margin.map((r) => r.name).join(', ')} (маржа ${(high_margin[0].margin_pct * 100).toFixed(0)}%+)`,
        impact: 0.15,
      });
    }
    if (months_to_reach != null && months_to_reach > 0 && months_to_reach <= plan.horizonMonths) {
      levers.push({
        id: 'time',
        title: `при текущем росте ~${months_to_reach} мес.`,
        detail: `+${plan.trafficGrowthPct}% трафика и +${plan.ticketGrowthPct}% чека в месяц — ёмкость догонит нужную выручку`,
        impact: 0.8,
      });
    } else if (months_to_reach == null && gap > 0 && plan.assumedCupsPerDay <= 0) {
      levers.push({
        id: 'growth_up',
        title: 'подними оценку стаканов или темп роста',
        detail: 'факт слишком маленький как «потолок». укажи реалистичные шт/день после рекламы',
        impact: 0.9,
      });
    }
  } else {
    levers.push({
      id: 'hold',
      title: 'держать ритм и микс',
      detail: 'цель внутри ёмкости — зафиксируй qty по напиткам кнопкой «заполнить план по напиткам»',
      impact: 1,
    });
    if (plan.reinvestPct >= 30) {
      levers.push({
        id: 'reinvest_ok',
        title: 'реинвест в рост',
        detail: `в развитие уйдёт ~${Math.round(row.reinvest_total).toLocaleString('ru-RU')} ₽ (мкт ${Math.round(row.reinvest.marketing).toLocaleString('ru-RU')} · об ${Math.round(row.reinvest.equipment).toLocaleString('ru-RU')})`,
        impact: 0.4,
      });
    }
  }

  return {
    feasibility: horizon_feasibility,
    this_month_feasibility,
    why,
    horizon_note,
    first_ok_month,
    first_ok_label,
    need_revenue,
    need_cups_day: row.solve.cups_per_day,
    need_net: row.solve.net,
    can_revenue,
    can_cups_day,
    can_net: can.net,
    end_capacity_revenue,
    gap_revenue: gap,
    growth_needed_pct,
    months_to_reach: first_ok ? first_ok.index : months_to_reach,
    levers: levers.sort((a, b) => b.impact - a.impact).slice(0, 5),
  };
}

function format_gap(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

/** агрегировать qty предложения по названию напитка (все размеры) */
export function drink_plan_preview(
  cells: plan_mix_cell[],
  rows: plan_sku_row[],
  days: number
): {
  name: string;
  tech_card_id: string;
  qty: number;
  revenue: number;
  qty_day: number;
  fact_qty: number;
  margin_pct: number;
}[] {
  const by_id = new Map<
    string,
    { name: string; tech_card_id: string; qty: number; revenue: number; fact_qty: number; margin_w: number; rev_w: number }
  >();
  const row_map = new Map(rows.map((r) => [`${r.tech_card_id}:${r.size_key}`, r]));
  for (const c of cells) {
    if (c.qty <= 0) continue;
    const meta = row_map.get(`${c.tech_card_id}:${c.size_key}`);
    const cur = by_id.get(c.tech_card_id) ?? {
      name: meta?.name ?? c.tech_card_id,
      tech_card_id: c.tech_card_id,
      qty: 0,
      revenue: 0,
      fact_qty: 0,
      margin_w: 0,
      rev_w: 0,
    };
    cur.qty += c.qty;
    cur.revenue += c.revenue;
    cur.fact_qty += meta?.fact_qty ?? 0;
    const m = c.price > 0 ? (c.price - c.unit_cost) / c.price : 0;
    cur.margin_w += m * c.revenue;
    cur.rev_w += c.revenue;
    by_id.set(c.tech_card_id, cur);
  }
  return [...by_id.values()]
    .map((r) => ({
      name: r.name,
      tech_card_id: r.tech_card_id,
      qty: r.qty,
      revenue: r.revenue,
      qty_day: r.qty / Math.max(1, days),
      fact_qty: r.fact_qty,
      margin_pct: r.rev_w > 0 ? r.margin_w / r.rev_w : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function build_roadmap(input: {
  state: finance_state;
  baseline: plan_baseline;
  plan: business_plan;
  start_month: string;
}): roadmap_month[] {
  const { state, baseline, plan, start_month } = input;
  const horizon = plan.horizonMonths as plan_horizon;
  const months = month_ids_ahead(start_month, horizon);
  const out: roadmap_month[] = [];

  let traffic_mult = 1;
  let ticket_mult = 1;
  const base_cap = baseline.capacity_revenue > 0 ? baseline.capacity_revenue : baseline.break_even;
  const avg_check =
    baseline.fact_drinks > 0 && baseline.fact_revenue > 0
      ? baseline.fact_revenue / baseline.fact_drinks
      : baseline.rows.length > 0
        ? baseline.rows.reduce((s, r) => s + r.weight * r.price, 0) || 350
        : 350;

  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const days = days_in_month(month);
    // только явные % из стратегии — без «магии» от маркетинга (она раздувала ёмкость до лямов)
    const raw_factor = traffic_mult * ticket_mult;
    const growth_factor = Math.min(raw_factor, MAX_CAPACITY_MULT);
    const capacity_revenue = base_cap * growth_factor;
    const capacity_cups_day = avg_check > 0 ? capacity_revenue / avg_check / days : 0;

    const solve = solve_month({
      state,
      baseline,
      target_net: plan.monthlyNetTarget,
      mix_tilt_pct: plan.mixTiltPct,
      days,
      // чек в солвере не разгоняем выше потолка ёмкости
      price_factor: Math.min(ticket_mult, Math.sqrt(MAX_CAPACITY_MULT)),
    });

    const reinvest_total = Math.round(Math.max(0, solve.net) * (plan.reinvestPct / 100));
    const owner_take = Math.round(Math.max(0, solve.net) - reinvest_total);
    const reinvest = split_reinvest(reinvest_total, plan.reinvestSplit);

    out.push({
      month,
      index: i,
      target_net: plan.monthlyNetTarget,
      capacity_revenue: Math.round(capacity_revenue),
      capacity_cups_day,
      solve,
      owner_take,
      reinvest_total,
      reinvest,
      feasibility: feasibility_of(solve.revenue, capacity_revenue, solve.reachable, {
        capacity_source: baseline.capacity_source,
      }),
      growth_factor,
    });

    traffic_mult *= 1 + plan.trafficGrowthPct / 100;
    ticket_mult *= 1 + plan.ticketGrowthPct / 100;
  }

  return out;
}

/** записать qty/price плана в monthsData + capex/маркетинг по roadmap */
export function apply_roadmap_to_state(
  state: finance_state,
  roadmap: roadmap_month[],
  opts?: { apply_reinvest?: boolean; marketing_opex_id?: string }
): finance_state {
  let next = state;
  const apply_reinvest = opts?.apply_reinvest !== false;
  let marketing_id = opts?.marketing_opex_id ?? 'marketing';

  if (apply_reinvest && !next.opexCategories.some((c) => c.id === marketing_id)) {
    next = {
      ...next,
      opexCategories: [...next.opexCategories, { id: marketing_id, name: 'маркетинг' }],
    };
  }

  for (const row of roadmap) {
    const cells = row.solve.cells;
    next = add_month(next, row.month);

    next = {
      ...next,
      monthsData: next.monthsData.map((m) => {
        if (m.month !== row.month) return m;
        const sales: Record<string, Record<string, sales_cell>> = { ...m.sales };
        for (const cell of cells) {
          sales[cell.tech_card_id] = {
            ...(sales[cell.tech_card_id] ?? {}),
            [cell.size_key]: { price: cell.price, qty: cell.qty },
          };
        }
        let opex = { ...m.opex };
        let cashFlow = {
          inflowInvestments: m.cashFlow?.inflowInvestments ?? 0,
          outflowCapex: m.cashFlow?.outflowCapex ?? 0,
        };
        if (apply_reinvest) {
          opex = { ...opex, [marketing_id]: row.reinvest.marketing };
          cashFlow = {
            ...cashFlow,
            outflowCapex: row.reinvest.equipment,
          };
        }
        return { ...m, sales, opex, cashFlow };
      }),
    };
  }

  return next;
}

/** применить только выбранный месяц roadmap в sales */
export function apply_month_cells_to_state(
  state: finance_state,
  month: string,
  cells: plan_mix_cell[],
  reinvest?: { marketing: number; equipment: number },
  marketing_opex_id = 'marketing'
): finance_state {
  let next = add_month(state, month);
  if (reinvest && !next.opexCategories.some((c) => c.id === marketing_opex_id)) {
    next = {
      ...next,
      opexCategories: [...next.opexCategories, { id: marketing_opex_id, name: 'маркетинг' }],
    };
  }

  return {
    ...next,
    monthsData: next.monthsData.map((m) => {
      if (m.month !== month) return m;
      const sales: Record<string, Record<string, sales_cell>> = { ...m.sales };
      for (const cell of cells) {
        sales[cell.tech_card_id] = {
          ...(sales[cell.tech_card_id] ?? {}),
          [cell.size_key]: { price: cell.price, qty: cell.qty },
        };
      }
      if (!reinvest) return { ...m, sales };
      return {
        ...m,
        sales,
        opex: { ...m.opex, [marketing_opex_id]: reinvest.marketing },
        cashFlow: {
          inflowInvestments: m.cashFlow?.inflowInvestments ?? 0,
          outflowCapex: reinvest.equipment,
        },
      };
    }),
  };
}

export function patch_business_plan(
  state: finance_state,
  patch: Partial<business_plan>
): finance_state {
  const cur = { ...default_business_plan(), ...(state.businessPlan ?? {}) };
  return { ...state, businessPlan: { ...cur, ...patch } };
}

export function apply_strategy_preset(
  state: finance_state,
  id: Exclude<plan_strategy_id, 'custom'>
): finance_state {
  const preset = STRATEGY_PRESETS.find((p) => p.id === id);
  if (!preset) return state;
  return patch_business_plan(state, {
    strategyId: id,
    reinvestPct: preset.reinvestPct,
    reinvestSplit: { ...preset.reinvestSplit },
    trafficGrowthPct: preset.trafficGrowthPct,
    ticketGrowthPct: preset.ticketGrowthPct,
    mixTiltPct: preset.mixTiltPct,
  });
}
