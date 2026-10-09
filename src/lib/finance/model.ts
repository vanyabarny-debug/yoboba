/**
 * финансовая модель точки (портирована из Bubble Manager) + склад.
 * структура состояния совместима с бэкапом bubble_manager_backup_*.json,
 * поэтому старые файлы импортируются без потерь.
 */
import type { menu_item } from '@/lib/types';
import { expand_items_for_stock } from '@/lib/combo';
import { get_item_volumes } from '@/lib/product-details';

export const FINANCE_STATE_VERSION = 5;

export type plan_horizon = 3 | 6 | 12;
export type plan_strategy_id = 'launch' | 'conservative' | 'balanced' | 'growth' | 'custom';

export type plan_reinvest_split = {
  marketing: number;
  equipment: number;
  stock: number;
  reserve: number;
};

/** цель и стратегия роста для вкладки «план» */
export type business_plan = {
  horizonMonths: plan_horizon;
  /** целевая чистая прибыль точки, ₽/мес */
  monthlyNetTarget: number;
  strategyId: plan_strategy_id;
  /** доля чистой в развитие (0–100); 0 = всё себе, реинвест не обязателен */
  reinvestPct: number;
  reinvestSplit: plan_reinvest_split;
  /** ожидаемый рост трафика, %/мес */
  trafficGrowthPct: number;
  /** ожидаемый рост среднего чека, %/мес */
  ticketGrowthPct: number;
  /** наклон микса к маржинальным SKU, 0–15 */
  mixTiltPct: number;
  /**
   * Сколько стаканов/день реально можете при нормальной узнаваемости/рекламе.
   * 0 = только факт (для новой точки факт занижает ёмкость).
   */
  assumedCupsPerDay: number;
};

export const DEFAULT_REINVEST_SPLIT: plan_reinvest_split = {
  marketing: 40,
  equipment: 25,
  stock: 20,
  reserve: 15,
};

export function default_business_plan(): business_plan {
  return {
    horizonMonths: 6,
    monthlyNetTarget: 0,
    strategyId: 'launch',
    reinvestPct: 15,
    reinvestSplit: { marketing: 70, equipment: 10, stock: 10, reserve: 10 },
    trafficGrowthPct: 5,
    ticketGrowthPct: 1,
    mixTiltPct: 5,
    assumedCupsPerDay: 0,
  };
}

/** id категории склада (сырьё / упаковка / свои) */
export type material_category = string;

export type stock_category = { id: string; name: string; color: string };

/** метки как в Finder: цветная точка у файла */
export const FINDER_LABEL_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#8E8E93',
] as const;

export const default_stock_categories: stock_category[] = [
  { id: 'dry', name: 'чаи и смеси', color: '#FF9500' },
  { id: 'liquids', name: 'молоко и жидкости', color: '#5AC8FA' },
  { id: 'toppings', name: 'сиропы и топпинги', color: '#AF52DE' },
  { id: 'packaging', name: 'упаковка', color: '#007AFF' },
  { id: 'retail', name: 'готовая продукция', color: '#34C759' },
  { id: 'raw', name: 'сырьё', color: '#FF3B30' },
];

export function merge_stock_categories(existing: stock_category[]): stock_category[] {
  const by_id = new Map(existing.map((c) => [c.id, c]));
  const out: stock_category[] = [];
  for (const d of default_stock_categories) {
    out.push(by_id.get(d.id) ?? { ...d });
    by_id.delete(d.id);
  }
  for (const rest of by_id.values()) out.push(rest);
  return out;
}

/** раскладывает известные позиции склада по полкам */
export function stock_category_for(m: { id: string; name: string; category?: string }): string {
  const def = default_materials.find((d) => d.id === m.id);
  if (def) return def.category;
  const n = m.name.toLowerCase().replace(/ё/g, 'е');
  const id = m.id.toLowerCase();
  if (/стакан|крышк|пленк|трубоч|упаков/.test(n) || /cup_|lid|film|straw/.test(id)) return 'packaging';
  if (/моти|макарун/.test(n) || id === 'mochi' || id === 'macaroon') return 'retail';
  if (
    /сироп|концентр|топпинг|джус|желе|пюре|тапиок|экстракт|розов/.test(n) ||
    /jb_|jelly|syrup|conc_|puree|tapioca|juiceballs|toppings|fruits|menthol|rose_water/.test(id)
  ) {
    return 'toppings';
  }
  if (/молоко|сливк|газир|^вода\b|сырная/.test(n) || /milk|cream|soda|condensed|cheese_foam/.test(id)) return 'liquids';
  if (/чай|матча|таро|какао|сахар|специ|смес/.test(n) || /tea|matcha|taro|cocoa|cane_sugar|spices/.test(id)) return 'dry';
  return m.category || 'raw';
}
export type material_unit = 'g' | 'kg' | 'ml' | 'L' | 'pcs';

export type material = {
  id: string;
  name: string;
  category: material_category;
  unit: material_unit;
  /** цена закупки за единицу (`unit`) */
  costPerUnit: number;
  /** минимальный остаток в базовых единицах (г / мл / шт) — ниже него подсвечиваем */
  minStock?: number;
};

/** шаг готовки для кассира: понятное имя, сколько класть, короткая подсказка */
export type prep_step = {
  id: string;
  title: string;
  hint?: string;
  materialId?: string;
  /** в базовых единицах материала (г / мл / шт); 0 — действие без граммовки */
  qty: number;
};

export type tech_card_size = {
  volume: number;
  /** ингредиенты: material_id → количество в базовых единицах (г / мл / шт) */
  ingredients: Record<string, number>;
  packaging: Record<string, number>;
  /** @deprecated этапы теперь на tech_card.steps */
  steps?: prep_step[];
  /** 650 мл правится отдельно и больше не следует за 500 мл */
  manual?: boolean;
};

export type tech_card = {
  id: string;
  name: string;
  /** позиция меню сайта, к которой привязана техкарта */
  menu_item_id?: string | null;
  /** можно заказать холодным — иконка в меню и выбор у гостя */
  cold?: boolean;
  /** можно заказать горячим */
  hot?: boolean;
  /** этапы готовки общие для всех объёмов; граммовка — для базового (обычно 500 мл) */
  steps?: prep_step[];
  /** ключи размеров: S/M/L (наследие) или объём в мл ('500', '650') */
  sizes: Record<string, tech_card_size>;
};

export type opex_category = { id: string; name: string };

export type equipment = { id: string; name: string; price: number; months: number };

export type sales_cell = { price: number; qty: number };

export type transaction = {
  id: string;
  day: number;
  type: 'expense' | 'income';
  /** material | capex | investment | other_income | other_expense | <opex category id> */
  category: string;
  amount: number;
  description: string;
  materialId?: string;
  /** количество в единицах закупки материала (`material.unit`) */
  quantity?: number;
};

/** тип выплаты персоналу */
export type payroll_kind = 'salary' | 'advance' | 'bonus' | 'one_time' | 'other';

export const PAYROLL_KINDS: { id: payroll_kind; label: string }[] = [
  { id: 'salary', label: 'зп' },
  { id: 'advance', label: 'аванс' },
  { id: 'bonus', label: 'премия' },
  { id: 'one_time', label: 'разовая' },
  { id: 'other', label: 'прочее' },
];

export function payroll_kind_label(kind?: payroll_kind | string) {
  return PAYROLL_KINDS.find((k) => k.id === kind)?.label ?? 'зп';
}

function parse_payroll_kind(raw: unknown): payroll_kind {
  const s = String(raw || '');
  return PAYROLL_KINDS.some((k) => k.id === s) ? (s as payroll_kind) : 'salary';
}

/** строка ФОТ: выплата сотруднику за месяц */
export type payroll_line = {
  id: string;
  /** связь с сотрудником из персонала; без id — свободная строка */
  sellerId?: string;
  name: string;
  /** сумма на руки, ₽ */
  amount: number;
  /** если true — сверху считается НДФЛ от этой суммы */
  withNdfl: boolean;
  /** зп / аванс / премия / разовая / прочее */
  kind?: payroll_kind;
  /** комментарий к выплате */
  note?: string;
};

export type month_data = {
  /** YYYY-MM */
  month: string;
  sales: Record<string, Record<string, sales_cell>>;
  retailSales?: Record<string, sales_cell>;
  opex: Record<string, number>;
  /** разбивка ФОТ по людям; сумма синхронизируется в opex.salary* */
  payroll?: payroll_line[];
  cashFlow?: { inflowInvestments: number; outflowCapex: number };
  transactions?: transaction[];
};

export type stock_movement_type = 'in' | 'out' | 'writeoff' | 'adjust' | 'sale' | 'staff';

export type stock_actor_role = 'admin' | 'seller';

export type stock_actor = {
  id: string;
  name: string;
  role: stock_actor_role;
};

export type stock_audit_action = 'adjust' | 'inventory' | 'writeoff' | 'receipt' | 'delete_movement';

export type stock_audit_entry = {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: stock_actor_role;
  action: stock_audit_action;
  materialId?: string;
  materialName?: string;
  qtyBefore?: number;
  qtyAfter?: number;
  note?: string;
  movementId?: string;
};

export type stock_movement = {
  id: string;
  /** ISO дата */
  date: string;
  type: stock_movement_type;
  materialId: string;
  /** количество в базовых единицах (г / мл / шт); для adjust — новый остаток */
  qty: number;
  /** стоимость партии, ₽ (для поступлений) */
  total?: number;
  note?: string;
  /** связанная операция закупки */
  transactionId?: string;
  /** заказ, из которого списан расход (sale / staff) */
  orderId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: stock_actor_role;
};

export type order_stock_item = {
  menu_id: string;
  name: string;
  price: number;
  quantity: number;
  volume?: string;
  kind?: 'sale' | 'staff';
  combo_components?: {
    menu_id: string;
    name: string;
    volume?: string;
    quantity?: number;
  }[];
};

export type finance_state = {
  version: number;
  materials: material[];
  techCards: tech_card[];
  opexCategories: opex_category[];
  stockCategories: stock_category[];
  equipments: equipment[];
  monthsData: month_data[];
  stockMovements: stock_movement[];
  /** id техкарт и позиций меню, которые удалили — дефолты из кода их не возвращают */
  removedTechCardIds?: string[];
  /** журнал «кто / что / когда» — дублируется в supabase.stock_audit */
  stockAudit?: stock_audit_entry[];
  /** ISO время последней полной инвентаризации; нет — склад считается неподтверждённым */
  stockCountedAt?: string | null;
  /** ставка налога, % — смысл зависит от taxRegime */
  taxRate: number;
  /** НДФЛ с ФОТ «на руки», % */
  ndflRate: number;
  /** режим налогообложения */
  taxRegime: tax_regime;
  /** патент: фикс в месяц, ₽ */
  taxPatentMonthly: number;
  /** страховые взносы (ОПС/ОМС/ВНиМ), % от ФОТ «на руки»; на АУСН = 0 */
  insuranceRate: number;
  /** фикс. взнос на травматизм ₽/мес (на АУСН при наличии сотрудников), иначе 0 */
  injuryMonthly?: number;
  /** произвольные налоги/взносы — только для режима custom (другие страны и т.п.) */
  customTaxes?: custom_tax_line[];
  /** цель чистой и стратегия роста (вкладка «план») */
  businessPlan?: business_plan;
}

export type tax_regime = 'ausn_income' | 'ausn_profit' | 'usn_income' | 'usn_profit' | 'patent' | 'custom';

export type tax_kind = 'income' | 'profit' | 'patent' | 'custom';

/** база произвольного налога в custom-режиме */
export type custom_tax_basis = 'revenue' | 'profit' | 'payroll' | 'fixed';

export type custom_tax_line = {
  id: string;
  name: string;
  basis: custom_tax_basis;
  /** % или ₽/мес при basis=fixed */
  value: number;
};

export const CUSTOM_TAX_BASIS: { id: custom_tax_basis; label: string }[] = [
  { id: 'revenue', label: '% с выручки' },
  { id: 'profit', label: '% с прибыли' },
  { id: 'payroll', label: '% с ФОТ' },
  { id: 'fixed', label: 'фикс ₽/мес' },
];

/** травматизм на АУСН 2026: 2 959 ₽/год (пост. Правительства № 1729) */
export const AUSN_INJURY_YEARLY = 2959;
export const AUSN_INJURY_MONTHLY = Math.round(AUSN_INJURY_YEARLY / 12); // 247

export type tax_regime_meta = {
  id: tax_regime;
  label: string;
  hint: string;
  kind: tax_kind;
  rate: number;
  insurance_rate: number;
  /** показывать поле страховых взносов % */
  show_insurance: boolean;
  /** показывать травматизм */
  show_injury: boolean;
  injury_monthly: number;
  /** показывать НДФЛ (РФ) */
  show_ndfl: boolean;
};

export const TAX_REGIMES: tax_regime_meta[] = [
  {
    id: 'ausn_income',
    label: 'аусн «доходы»',
    hint: 'налог 8% с доходов',
    kind: 'income',
    rate: 8,
    insurance_rate: 0,
    show_insurance: false,
    show_injury: true,
    injury_monthly: AUSN_INJURY_MONTHLY,
    show_ndfl: true,
  },
  {
    id: 'ausn_profit',
    label: 'аусн «доходы − расходы»',
    hint: 'налог 20% с прибыли · мин. 3% с доходов',
    kind: 'profit',
    rate: 20,
    insurance_rate: 0,
    show_insurance: false,
    show_injury: true,
    injury_monthly: AUSN_INJURY_MONTHLY,
    show_ndfl: true,
  },
  {
    id: 'usn_income',
    label: 'усн «доходы»',
    hint: 'налог 6% с доходов',
    kind: 'income',
    rate: 6,
    insurance_rate: 30,
    show_insurance: true,
    show_injury: false,
    injury_monthly: 0,
    show_ndfl: true,
  },
  {
    id: 'usn_profit',
    label: 'усн «доходы − расходы»',
    hint: 'налог 15% с прибыли',
    kind: 'profit',
    rate: 15,
    insurance_rate: 30,
    show_insurance: true,
    show_injury: false,
    injury_monthly: 0,
    show_ndfl: true,
  },
  {
    id: 'patent',
    label: 'патент (ПСН)',
    hint: 'стоимость патента задаёте сами (по региону)',
    kind: 'patent',
    rate: 0,
    insurance_rate: 30,
    show_insurance: true,
    show_injury: false,
    injury_monthly: 0,
    show_ndfl: true,
  },
  {
    id: 'custom',
    label: 'свой / другая страна',
    hint: 'любые налоги: % с выручки, прибыли, ФОТ или фикс',
    kind: 'custom',
    rate: 0,
    insurance_rate: 0,
    show_insurance: false,
    show_injury: false,
    injury_monthly: 0,
    show_ndfl: false,
  },
];

export function tax_regime_of(state: Pick<finance_state, 'taxRegime'>): tax_regime_meta {
  return TAX_REGIMES.find((r) => r.id === state.taxRegime) ?? TAX_REGIMES[0];
}

export function tax_label(state: Pick<finance_state, 'taxRegime' | 'taxRate' | 'customTaxes'>): string {
  const r = tax_regime_of(state);
  if (r.id === 'custom') {
    const names = (state.customTaxes ?? [])
      .filter((t) => t.basis !== 'payroll' && (Number(t.value) || 0) > 0)
      .map((t) => t.name.trim())
      .filter(Boolean);
    if (names.length === 1) return names[0]!;
    if (names.length > 1) return 'налоги';
    return 'налоги';
  }
  if (r.kind === 'patent') return 'патент';
  if (r.kind === 'profit') return `налог ${r.rate}% с прибыли`;
  return `налог ${r.rate}% с выручки`;
}

export function default_custom_taxes(): custom_tax_line[] {
  return [
    { id: new_id('ctx'), name: 'sales tax', basis: 'revenue', value: 0 },
    { id: new_id('ctx'), name: 'payroll tax', basis: 'payroll', value: 0 },
  ];
}

/** применить режим: ставки по закону РФ; custom — свои строки */
export function apply_tax_regime(state: finance_state, id: tax_regime): finance_state {
  const next = TAX_REGIMES.find((r) => r.id === id) ?? TAX_REGIMES[0];
  if (next.id === 'custom') {
    return {
      ...state,
      taxRegime: 'custom',
      taxRate: 0,
      insuranceRate: 0,
      injuryMonthly: 0,
      ndflRate: 0,
      customTaxes: state.customTaxes?.length ? state.customTaxes : default_custom_taxes(),
    };
  }
  return {
    ...state,
    taxRegime: next.id,
    taxRate: next.rate,
    insuranceRate: next.show_insurance ? next.insurance_rate : 0,
    injuryMonthly: next.show_injury ? next.injury_monthly : 0,
    ndflRate: state.ndflRate > 0 ? state.ndflRate : 13,
  };
}

export function injury_monthly_of(state: Pick<finance_state, 'taxRegime' | 'injuryMonthly'>) {
  const r = tax_regime_of(state);
  if (!r.show_injury) return 0;
  return Math.max(0, Math.round(Number(state.injuryMonthly ?? r.injury_monthly) || 0));
}

export function custom_taxes_of(state: Pick<finance_state, 'customTaxes'>): custom_tax_line[] {
  return Array.isArray(state.customTaxes) ? state.customTaxes : [];
}

/** сумма custom-налогов с выручки/прибыли/фикса */
export function custom_business_tax(
  lines: custom_tax_line[],
  revenue: number,
  deductible: number
): number {
  let sum = 0;
  for (const t of lines) {
    const v = Math.max(0, Number(t.value) || 0);
    if (t.basis === 'revenue') sum += revenue * (v / 100);
    else if (t.basis === 'profit') sum += Math.max(0, revenue - deductible) * (v / 100);
    else if (t.basis === 'fixed') sum += v;
  }
  return Math.max(0, sum);
}

/** % с ФОТ из custom-строк (сумма ставок) */
export function custom_payroll_rate(lines: custom_tax_line[]): number {
  return lines
    .filter((t) => t.basis === 'payroll')
    .reduce((s, t) => s + Math.max(0, Number(t.value) || 0), 0);
}

export function is_salary_opex(id: string) {
  return id.toLowerCase().includes('salary');
}

export function salary_opex_id(state: Pick<finance_state, 'opexCategories'>) {
  return state.opexCategories.find((c) => is_salary_opex(c.id))?.id ?? 'salary';
}

export function other_opex_sum(opex: Record<string, number> | undefined) {
  let s = 0;
  for (const [id, val] of Object.entries(opex ?? {})) {
    if (is_salary_opex(id)) continue;
    s += Number(val) || 0;
  }
  return s;
}

/** месяц-донор постоянных расходов (аренда/свет…): ближайший ≤ month с суммой > 0, иначе любой заполненный */
export function find_opex_donor(state: finance_state, month: string): month_data | null {
  const filled = state.monthsData
    .filter((m) => other_opex_sum(m.opex) > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!filled.length) return null;
  return [...filled].reverse().find((m) => m.month <= month) ?? filled[filled.length - 1];
}

/**
 * Opex месяца: ФОТ свой; постоянные — из месяца, иначе наследуем из донора
 * (чтобы прошлый месяц не был «пустым», если модель заполнена в текущем).
 */
export function resolve_month_opex(state: finance_state, month: string): Record<string, number> {
  const md = state.monthsData.find((m) => m.month === month);
  const own: Record<string, number> = { ...(md?.opex ?? {}) };
  for (const c of state.opexCategories) {
    if (own[c.id] == null) own[c.id] = 0;
  }
  if (other_opex_sum(own) > 0) return own;
  const donor = find_opex_donor(state, month);
  if (!donor || donor.month === month) return own;
  const merged = { ...own };
  for (const [id, val] of Object.entries(donor.opex ?? {})) {
    if (is_salary_opex(id)) continue;
    merged[id] = Number(val) || 0;
  }
  return merged;
}

/** проставить унаследованные постоянные во все пустые месяцы */
export function backfill_opex_months(state: finance_state): finance_state {
  const donor = find_opex_donor(state, '9999-12');
  if (!donor) return state;
  let changed = false;
  const monthsData = state.monthsData.map((m) => {
    if (other_opex_sum(m.opex) > 0) return m;
    const next_opex = { ...m.opex };
    let touched = false;
    for (const [id, val] of Object.entries(donor.opex ?? {})) {
      if (is_salary_opex(id)) continue;
      const v = Number(val) || 0;
      if (!(v > 0)) continue;
      if (Number(next_opex[id]) > 0) continue;
      next_opex[id] = v;
      touched = true;
    }
    if (!touched) return m;
    changed = true;
    return { ...m, opex: next_opex };
  });
  return changed ? { ...state, monthsData } : state;
}

export function ndfl_from_net(salary: number, ndfl_rate: number) {
  const r = Math.min(99, Math.max(0, ndfl_rate));
  if (r >= 100) return 0;
  return salary * (r / (100 - r));
}

export function insurance_from_net(salary: number, insurance_rate: number) {
  return Math.max(0, salary) * (Math.max(0, insurance_rate) / 100);
}

export function payroll_totals(
  lines: payroll_line[],
  ndfl_rate: number,
  insurance_rate = 0
): { net: number; taxable: number; ndfl: number; insurance: number } {
  let net = 0;
  let taxable = 0;
  for (const line of lines) {
    const a = Math.max(0, Math.round(Number(line.amount) || 0));
    net += a;
    if (line.withNdfl) taxable += a;
  }
  return {
    net,
    taxable,
    ndfl: ndfl_from_net(taxable, ndfl_rate),
    insurance: insurance_from_net(taxable, insurance_rate),
  };
}

function payroll_rates_of(
  state: Pick<finance_state, 'ndflRate' | 'insuranceRate' | 'taxRegime' | 'customTaxes'>
) {
  const r = tax_regime_of(state);
  if (r.id === 'custom') {
    return { ndfl_rate: 0, insurance_rate: custom_payroll_rate(custom_taxes_of(state)) };
  }
  return {
    ndfl_rate: r.show_ndfl ? Math.max(0, Number(state.ndflRate) || 0) : 0,
    insurance_rate: r.show_insurance ? Math.max(0, Number(state.insuranceRate) || 0) : 0,
  };
}

/** ФОТ месяца: из payroll, иначе одна строка из opex.salary */
export function resolve_month_payroll(
  state: Pick<finance_state, 'opexCategories' | 'ndflRate' | 'insuranceRate' | 'taxRegime' | 'customTaxes'>,
  m: month_data
): { lines: payroll_line[]; net: number; taxable: number; ndfl: number; insurance: number } {
  const { ndfl_rate, insurance_rate } = payroll_rates_of(state);
  const raw = Array.isArray(m.payroll)
    ? m.payroll
        .filter((l) => l && typeof l === 'object')
        .map((l): payroll_line => ({
          id: String(l.id || l.sellerId || new_id('pay')),
          ...(l.sellerId ? { sellerId: String(l.sellerId) } : {}),
          name: String(l.name || 'сотрудник').trim() || 'сотрудник',
          amount: Math.max(0, Math.round(Number(l.amount) || 0)),
          withNdfl: Boolean(l.withNdfl),
          kind: parse_payroll_kind(l.kind),
          ...(l.note ? { note: String(l.note).trim().slice(0, 200) } : {}),
        }))
    : [];
  if (raw.length) {
    return { lines: raw, ...payroll_totals(raw, ndfl_rate, insurance_rate) };
  }
  let salary = 0;
  for (const [id, val] of Object.entries(m.opex ?? {})) {
    if (is_salary_opex(id)) salary += Number(val) || 0;
  }
  const lines: payroll_line[] =
    salary > 0
      ? [{ id: 'payroll_all', name: 'ФОТ', amount: Math.round(salary), withNdfl: true, kind: 'salary' }]
      : [];
  return { lines, ...payroll_totals(lines, ndfl_rate, insurance_rate) };
}

/** записать разбивку ФОТ и синхронизировать opex.salary */
export function set_month_payroll(
  state: finance_state,
  month: string,
  lines: payroll_line[]
): finance_state {
  const cleaned = lines
    .map(
      (l): payroll_line => ({
        id: String(l.id || l.sellerId || new_id('pay')),
        ...(l.sellerId ? { sellerId: String(l.sellerId) } : {}),
        name: String(l.name || '').trim() || 'сотрудник',
        amount: Math.max(0, Math.round(Number(l.amount) || 0)),
        withNdfl: Boolean(l.withNdfl),
        kind: parse_payroll_kind(l.kind),
        ...(String(l.note || '').trim()
          ? { note: String(l.note).trim().slice(0, 200) }
          : {}),
      })
    )
    .filter((l) => l.name || l.amount > 0 || l.sellerId);
  const net = payroll_totals(cleaned, state.ndflRate, state.insuranceRate).net;
  const sid = salary_opex_id(state);
  const cats = state.opexCategories.some((c) => c.id === sid)
    ? state.opexCategories
    : [...state.opexCategories, { id: sid, name: 'зарплатный фонд (ФОТ)' }];
  return update_month({ ...state, opexCategories: cats }, month, (m) => ({
    ...m,
    payroll: cleaned,
    opex: { ...m.opex, [sid]: net },
  }));
}

type seller_pay_source = {
  id: string;
  name: string;
  role_title?: string;
  is_active?: boolean;
  salary_net?: number;
  with_ndfl?: boolean;
};

function is_legacy_fot_lump(p: payroll_line) {
  if (p.sellerId) return false;
  const name = (p.name || '').trim().toLowerCase();
  return p.id === 'payroll_all' || name === 'фот' || name === 'зарплатный фонд';
}

function seller_pay_label(s: Pick<seller_pay_source, 'name' | 'role_title'>) {
  const role = (s.role_title || '').trim();
  const name = (s.name || '').trim() || 'сотрудник';
  return role ? `${role} ${name}` : name;
}

/** слить ФОТ месяца с актуальным персоналом (база ЗП из карточки сотрудника) */
export function merge_payroll_with_sellers(
  payroll: payroll_line[] | undefined,
  sellers: seller_pay_source[]
): payroll_line[] {
  const active = sellers.filter((s) => s.is_active !== false);
  const stored = Array.isArray(payroll) ? payroll : [];
  const lines: payroll_line[] = [];
  const seen_sellers = new Set<string>();

  // сначала все сохранённые выплаты (у одного человека может быть несколько: аванс + зп + премия)
  for (const p of stored) {
    if (p.sellerId) {
      const seller = active.find((s) => s.id === p.sellerId);
      if (!seller) {
        // уволен — оставляем выплату как есть
        lines.push({
          ...p,
          kind: parse_payroll_kind(p.kind),
        });
        seen_sellers.add(p.sellerId);
        continue;
      }
      lines.push({
        ...p,
        id: p.id || new_id('pay'),
        sellerId: p.sellerId,
        name: seller_pay_label(seller) || p.name,
        kind: parse_payroll_kind(p.kind),
      });
      seen_sellers.add(p.sellerId);
      continue;
    }
    if (is_legacy_fot_lump(p) && active.length) continue; // общая строка «ФОТ» → люди из персонала
    lines.push({ ...p, kind: parse_payroll_kind(p.kind) });
  }

  // сотрудники без ни одной выплаты в месяце — одна строка «зп» из карточки (даже с 0 ₽)
  for (const s of active) {
    if (seen_sellers.has(s.id)) continue;
    const amount = Math.max(0, Math.round(Number(s.salary_net) || 0));
    lines.push({
      id: `pay-${s.id}`,
      sellerId: s.id,
      name: seller_pay_label(s),
      amount,
      withNdfl: s.with_ndfl != null ? Boolean(s.with_ndfl) : amount > 0,
      kind: 'salary',
    });
  }

  return lines;
}

/** Сколько зарплаты можно заложить и сколько чистой при этом останется.
 *  Пул — прибыль до ФОТ. keep — чистая, которую не трогаем.
 *  Без налога остаток пула уходит на руки. С налогом из остатка ещё платится НДФЛ и взносы. */
export function affordable_payroll(input: {
  net_profit: number;
  salary: number;
  ndfl: number;
  insurance: number;
  ndfl_rate: number;
  insurance_rate: number;
  keep?: number;
}) {
  const pool = input.net_profit + input.salary + input.ndfl + input.insurance;
  const keep = Math.min(Math.max(0, input.keep ?? 0), Math.max(0, pool));
  const budget = pool - keep;
  const ndfl_rate = Math.min(99, Math.max(0, input.ndfl_rate));
  const insurance_rate = Math.max(0, input.insurance_rate) / 100;
  const load = ndfl_rate / (100 - ndfl_rate) + insurance_rate;
  const with_tax = load > 0 ? budget / (1 + load) : budget;
  return {
    pool,
    keep,
    without_tax: budget,
    with_tax,
    tax: budget - with_tax,
  };
}

export function compute_month_tax(state: finance_state, revenue: number, deductible: number) {
  const r = tax_regime_of(state);
  if (r.id === 'custom') {
    return custom_business_tax(custom_taxes_of(state), revenue, deductible);
  }
  if (r.kind === 'patent') return Math.max(0, Number(state.taxPatentMonthly) || 0);
  const rate = r.rate / 100;
  if (r.kind === 'profit') return Math.max(0, (revenue - deductible) * rate);
  return Math.max(0, revenue * rate);
}

export const unit_labels: Record<material_unit, string> = {
  g: 'г',
  kg: 'кг',
  ml: 'мл',
  L: 'л',
  pcs: 'шт',
};

export const material_category_labels: Record<string, string> = {
  dry: 'чаи и смеси',
  liquids: 'молоко и жидкости',
  toppings: 'сиропы и топпинги',
  packaging: 'упаковка',
  retail: 'готовая продукция',
  raw: 'сырьё',
};

export function next_finder_color(used: string[]) {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return FINDER_LABEL_COLORS.find((c) => !taken.has(c.toLowerCase())) ?? FINDER_LABEL_COLORS[used.length % FINDER_LABEL_COLORS.length];
}

/** базовая единица для склада и техкарт */
export function base_unit(unit: material_unit): 'g' | 'ml' | 'pcs' {
  if (unit === 'kg' || unit === 'g') return 'g';
  if (unit === 'L' || unit === 'ml') return 'ml';
  return 'pcs';
}

export function base_unit_label(unit: material_unit) {
  return unit_labels[base_unit(unit)];
}

/** сколько базовых единиц в одной единице закупки */
export function base_per_unit(unit: material_unit) {
  return unit === 'kg' || unit === 'L' ? 1000 : 1;
}

/** цена одной базовой единицы (за 1 г / 1 мл / 1 шт) */
export function cost_per_base_unit(m: material) {
  return m.costPerUnit / base_per_unit(m.unit);
}

/** красиво показать количество в базовых единицах */
export function format_base_qty(m: material, qty: number) {
  const b = base_unit(m.unit);
  if (b === 'pcs') return `${Math.round(qty).toLocaleString('ru-RU')} шт`;
  if (Math.abs(qty) >= 1000) {
    return `${(qty / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${b === 'g' ? 'кг' : 'л'}`;
  }
  return `${Math.round(qty).toLocaleString('ru-RU')} ${b === 'g' ? 'г' : 'мл'}`;
}

export function format_rub(n: number, digits = 0) {
  return `${(Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: digits })} ₽`;
}

export function month_label(month: string) {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function current_month_id(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function new_id(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/* дефолты (из Bubble Manager)                                          */
/* ------------------------------------------------------------------ */

/** вода из фильтра, лёд, снег — не считаем на складе */
export function is_infinite_stock(id_or_name: string) {
  const s = id_or_name.trim().toLowerCase().replace(/ё/g, 'е');
  if (s === 'water' || s === 'ice' || s === 'snow' || s === 'filtered_water') return true;
  if (s === 'лед' || s === 'снег') return true;
  if (s === 'вода' || s === 'вода (фильтрованная)') return true;
  if (s.includes('фильтрован') && s.includes('вод')) return true;
  return false;
}

export function material_is_infinite(m: { id: string; name: string }) {
  return is_infinite_stock(m.id) || is_infinite_stock(m.name);
}

export const default_materials: material[] = [
  { id: 'tea_black', name: 'чай чёрный (сухой)', category: 'dry', unit: 'kg', costPerUnit: 1500, minStock: 400 },
  { id: 'tea_jasmine', name: 'чай зелёный жасмин (сухой)', category: 'dry', unit: 'kg', costPerUnit: 1600, minStock: 400 },
  { id: 'matcha', name: 'матча (порошок)', category: 'dry', unit: 'kg', costPerUnit: 3500, minStock: 200 },
  { id: 'taro_mix', name: 'смесь «таро»', category: 'dry', unit: 'kg', costPerUnit: 900, minStock: 1000 },
  { id: 'cocoa', name: 'какао-порошок', category: 'dry', unit: 'kg', costPerUnit: 700, minStock: 500 },
  { id: 'cane_sugar', name: 'сахар тростниковый', category: 'dry', unit: 'kg', costPerUnit: 120, minStock: 1000 },
  { id: 'spices', name: 'специи (масала)', category: 'dry', unit: 'kg', costPerUnit: 1800 },
  { id: 'milk', name: 'молоко', category: 'liquids', unit: 'L', costPerUnit: 80, minStock: 5000 },
  { id: 'cream', name: 'сливки', category: 'liquids', unit: 'L', costPerUnit: 220 },
  { id: 'condensed', name: 'сгущённое молоко', category: 'liquids', unit: 'kg', costPerUnit: 280 },
  { id: 'soda', name: 'газированная вода', category: 'liquids', unit: 'L', costPerUnit: 25, minStock: 5000 },
  { id: 'cheese_foam', name: 'сырная шапка', category: 'liquids', unit: 'kg', costPerUnit: 650, minStock: 1000 },
  { id: 'tapioca', name: 'тапиока', category: 'toppings', unit: 'kg', costPerUnit: 400, minStock: 2000 },
  { id: 'syrup_brown_sugar', name: 'сироп «чёрный сахар»', category: 'toppings', unit: 'L', costPerUnit: 420, minStock: 2000 },
  { id: 'syrup_chocolate', name: 'сироп «шоколадный»', category: 'toppings', unit: 'L', costPerUnit: 400, minStock: 1000 },
  { id: 'syrup_curacao', name: 'сироп «блю кюрасао»', category: 'toppings', unit: 'L', costPerUnit: 450, minStock: 1000 },
  { id: 'syrup_raspberry', name: 'сироп «малина»', category: 'toppings', unit: 'L', costPerUnit: 400, minStock: 1000 },
  { id: 'syrup_coconut_caramel', name: 'сироп «кокос карамельный»', category: 'toppings', unit: 'L', costPerUnit: 450, minStock: 1000 },
  { id: 'conc_strawberry', name: 'концентрат клубники', category: 'toppings', unit: 'L', costPerUnit: 480, minStock: 1000 },
  { id: 'puree_strawberry', name: 'пюре клубника', category: 'toppings', unit: 'kg', costPerUnit: 550, minStock: 1000 },
  { id: 'rose_water', name: 'розовая вода', category: 'toppings', unit: 'L', costPerUnit: 900 },
  { id: 'menthol', name: 'экстракт ментола', category: 'toppings', unit: 'ml', costPerUnit: 8 },
  { id: 'jb_strawberry', name: 'джус-боллы клубника', category: 'toppings', unit: 'kg', costPerUnit: 620, minStock: 1500 },
  { id: 'jb_passion', name: 'джус-боллы маракуйя', category: 'toppings', unit: 'kg', costPerUnit: 620, minStock: 1500 },
  { id: 'jb_mango', name: 'джус-боллы манго', category: 'toppings', unit: 'kg', costPerUnit: 620, minStock: 1500 },
  { id: 'jb_yogurt', name: 'джус-боллы йогурт', category: 'toppings', unit: 'kg', costPerUnit: 620, minStock: 1500 },
  { id: 'jb_mango_passion', name: 'джус-боллы манго-маракуйя', category: 'toppings', unit: 'kg', costPerUnit: 640, minStock: 1500 },
  { id: 'jelly_lychee', name: 'желе «личи»', category: 'toppings', unit: 'kg', costPerUnit: 480, minStock: 1000 },
  { id: 'jelly_coconut', name: 'желе кокосовое', category: 'toppings', unit: 'kg', costPerUnit: 480, minStock: 1000 },
  { id: 'cup_plastic', name: 'стаканы пластиковые', category: 'packaging', unit: 'pcs', costPerUnit: 5, minStock: 200 },
  { id: 'lid', name: 'крышки', category: 'packaging', unit: 'pcs', costPerUnit: 2, minStock: 200 },
  { id: 'film', name: 'плёнка для запайки', category: 'packaging', unit: 'pcs', costPerUnit: 1, minStock: 300 },
  { id: 'straw', name: 'трубочки широкие', category: 'packaging', unit: 'pcs', costPerUnit: 1.5, minStock: 300 },
  { id: 'cup_paper', name: 'бумажные стаканчики', category: 'packaging', unit: 'pcs', costPerUnit: 6, minStock: 100 },
  { id: 'mochi', name: 'моти (закупка)', category: 'retail', unit: 'pcs', costPerUnit: 90 },
  { id: 'macaroon', name: 'макаруны', category: 'retail', unit: 'pcs', costPerUnit: 60 },
];

const sealed = (ingredients: Record<string, number>, volume: number): tech_card_size => ({
  volume,
  ingredients,
  packaging: { cup_plastic: 1, film: 1, straw: 1 },
});

const lidded = (ingredients: Record<string, number>, volume: number): tech_card_size => ({
  volume,
  ingredients,
  packaging: { cup_plastic: 1, lid: 1, straw: 1 },
});

function sizes_sml(
  make: (scale: number, volume: number) => tech_card_size
): Record<string, tech_card_size> {
  return {
    S: make(1, 350),
    M: make(1.4, 450),
    L: make(1.8, 600),
  };
}

function qty(base: number, scale: number) {
  return Math.round(base * scale * 10) / 10;
}

/** исходные техкарты Bubble Manager + рецепты живого меню (S/M/L → при синхронизации станут 500/650 мл) */
export const default_tech_cards: tech_card[] = [
  {
    id: 'tc_classic_milk',
    name: 'классический милк бабл ти',
    menu_item_id: 'original-black',
    sizes: sizes_sml((k, v) => sealed({ tea_black: qty(5, k), milk: qty(150, k), syrup_brown_sugar: qty(20, k), tapioca: qty(50, k) }, v)),
  },
  {
    id: 'tc_jasmine_milk',
    name: 'зелёный жасмин',
    menu_item_id: 'jasmine-green',
    sizes: sizes_sml((k, v) => sealed({ tea_jasmine: qty(5, k), milk: qty(150, k), syrup_brown_sugar: qty(20, k), tapioca: qty(50, k) }, v)),
  },
  {
    id: 'tc_fruit_juiceballs',
    name: 'фруктовый чай с джус-болами',
    menu_item_id: 'klubnika-mango',
    sizes: sizes_sml((k, v) =>
      lidded({ puree_strawberry: qty(40, k), cane_sugar: qty(15, k), milk: qty(120, k), jb_mango: qty(50, k) }, v)
    ),
  },
  {
    id: 'tc_matcha_latte',
    name: 'матча латте с тапиокой',
    menu_item_id: 'matcha-latte-tiger',
    cold: true,
    hot: true,
    sizes: sizes_sml((k, v) =>
      sealed({ matcha: qty(3, k), milk: qty(200, k), syrup_brown_sugar: qty(20, k), tapioca: qty(40, k), cheese_foam: qty(30, k) }, v)
    ),
  },
  {
    id: 'tc_taro',
    name: 'таро',
    menu_item_id: 'taro',
    cold: true,
    hot: true,
    sizes: sizes_sml((k, v) => sealed({ taro_mix: qty(40, k), tapioca: qty(50, k), cheese_foam: qty(35, k) }, v)),
  },
  {
    id: 'tc_cocoa',
    name: 'какао',
    menu_item_id: 'kakao',
    sizes: sizes_sml((k, v) => sealed({ cocoa: qty(18, k), milk: qty(220, k), syrup_chocolate: qty(20, k), cheese_foam: qty(30, k) }, v)),
  },
  {
    id: 'tc_masala',
    name: 'масала чай',
    menu_item_id: 'masala-chai',
    sizes: sizes_sml((k, v) =>
      sealed({ tea_black: qty(6, k), cane_sugar: qty(12, k), spices: qty(3, k), cream: qty(40, k), tapioca: qty(50, k), cheese_foam: qty(30, k) }, v)
    ),
  },
  {
    id: 'tc_strawberry_lemonade',
    name: 'клубничный лимонад',
    menu_item_id: 'klubnichny-limonad',
    sizes: sizes_sml((k, v) => lidded({ soda: qty(250, k), conc_strawberry: qty(40, k), jb_strawberry: qty(50, k) }, v)),
  },
  {
    id: 'tc_tropic_fusion',
    name: 'тропический фьюжн',
    menu_item_id: 'tropichesky-limonad',
    sizes: sizes_sml((k, v) => lidded({ soda: qty(250, k), syrup_curacao: qty(35, k), jb_passion: qty(50, k), jelly_lychee: qty(20, k) }, v)),
  },
  {
    id: 'tc_rose_milk',
    name: 'нежная роза',
    menu_item_id: 'nezhnaya-roza',
    sizes: sizes_sml((k, v) => lidded({ milk: qty(220, k), conc_strawberry: qty(30, k), jb_strawberry: qty(50, k), rose_water: qty(8, k) }, v)),
  },
  {
    id: 'tc_raspberry_yogurt',
    name: 'малиновый йогурт',
    menu_item_id: 'malinovy-yogurt',
    sizes: sizes_sml((k, v) => lidded({ milk: qty(200, k), syrup_raspberry: qty(30, k), condensed: qty(20, k), jb_yogurt: qty(50, k) }, v)),
  },
  {
    id: 'tc_tropic_mango',
    name: 'тропический манго',
    menu_item_id: 'tropichesky-mango',
    sizes: sizes_sml((k, v) =>
      lidded({ milk: qty(200, k), syrup_coconut_caramel: qty(30, k), jb_mango_passion: qty(50, k), jelly_lychee: qty(20, k) }, v)
    ),
  },
  {
    id: 'tc_subzero',
    name: 'сабзиро',
    menu_item_id: 'subzero',
    sizes: sizes_sml((k, v) => lidded({ soda: qty(280, k), syrup_curacao: qty(35, k), jb_yogurt: qty(60, k), menthol: qty(2, k) }, v)),
  },
];

const lumped_material_ids = new Set(['juiceballs', 'syrup', 'tea', 'fruits', 'toppings', 'water', 'ice']);

function recipe_hint(card: { id: string; name: string; menu_item_id?: string | null }) {
  return `${card.id} ${card.menu_item_id || ''} ${card.name}`.toLowerCase();
}

function closest_size(sizes: Record<string, tech_card_size>, key: string): tech_card_size | undefined {
  if (sizes[key]) return sizes[key];
  const want = Number(key) || { S: 350, M: 450, L: 600 }[key] || 0;
  const entries = Object.entries(sizes);
  if (!entries.length) return undefined;
  return entries.reduce((best, cur) => {
    const bv = best[1].volume || Number(best[0]) || 0;
    const cv = cur[1].volume || Number(cur[0]) || 0;
    return Math.abs(cv - want) < Math.abs(bv - want) ? cur : best;
  })[1];
}

function remap_ingredients(ing: Record<string, number>, hint: string): Record<string, number> {
  const h = hint.toLowerCase().replace(/ё/g, 'е');
  const next: Record<string, number> = {};
  for (const [id, q] of Object.entries(ing)) {
    if (!id || q == null || is_infinite_stock(id)) continue;
    next[id] = q;
  }
  const take = (from: string, to: string) => {
    if (next[from] == null) return;
    if (next[to] == null) next[to] = next[from];
    delete next[from];
  };
  if (next.tea != null) take('tea', /жасмин/.test(h) ? 'tea_jasmine' : 'tea_black');
  if (next.juiceballs != null) {
    let to = 'jb_strawberry';
    if (/манго/.test(h) && /маракуй/.test(h)) to = 'jb_mango_passion';
    else if (/йогурт|сабзиро|malinovy/.test(h)) to = 'jb_yogurt';
    else if (/маракуй|фьюжн|tropichesky-limonad/.test(h)) to = 'jb_passion';
    else if (/манго|klubnika-mango|fruit/.test(h)) to = 'jb_mango';
    take('juiceballs', to);
  }
  if (next.syrup != null) {
    let to = 'syrup_brown_sugar';
    if (/какао|шоколад|kakao/.test(h)) to = 'syrup_chocolate';
    else if (/малин|yogurt/.test(h)) to = 'syrup_raspberry';
    else if (/фьюжн|кюрасао|сабзиро|tropichesky-limonad|subzero/.test(h)) to = 'syrup_curacao';
    else if (/тропическ.*манго|кокос|tropichesky-mango/.test(h)) to = 'syrup_coconut_caramel';
    else if (/лимонад|роза|nezhnaya|klubnichny/.test(h)) to = 'conc_strawberry';
    take('syrup', to);
  }
  if (next.toppings != null) take('toppings', 'jelly_lychee');
  if (next.fruits != null) take('fruits', 'puree_strawberry');
  return next;
}

function overlay_recipe(target: tech_card, source: tech_card) {
  for (const [key, size] of Object.entries(target.sizes)) {
    const src = closest_size(source.sizes, key);
    if (!src) continue;
    size.ingredients = remap_ingredients({ ...src.ingredients }, recipe_hint(target));
    if (!Object.keys(size.packaging).length) size.packaging = { ...src.packaging };
    if (!size.steps?.length && src.steps?.length) size.steps = src.steps.map((s) => ({ ...s, id: new_id('step') }));
  }
}

/** старые названия Bubble Manager → актуальные позиции меню */
const menu_name_aliases: [string, string][] = [
  ['классический милк', 'чёрный сахар'],
  ['милк бабл', 'чёрный сахар'],
  ['матча латте с тапиокой', 'матча латте'],
  ['фруктовый чай с джус-болами', 'клубника манго'],
  ['фруктовый чай', 'клубника манго'],
];

export const default_opex_categories: opex_category[] = [
  { id: 'rent', name: 'аренда помещения' },
  { id: 'electricity', name: 'свет' },
  { id: 'water', name: 'вода' },
  { id: 'salary', name: 'зарплатный фонд (ФОТ)' },
  { id: 'bank', name: 'банковское обслуживание' },
  { id: 'unexpected', name: 'непредвиденные расходы и потери' },
];

export const default_equipments: equipment[] = [
  { id: 'eq_1', name: 'машина для запайки стаканов', price: 17000, months: 24 },
  { id: 'eq_2', name: 'льдогенератор (15 кг/сут)', price: 16000, months: 24 },
  { id: 'eq_3', name: 'вармер (6 л) медленноварка', price: 8000, months: 24 },
  { id: 'eq_4', name: 'блендер профессиональный', price: 4000, months: 24 },
  { id: 'eq_5', name: 'термопот (17 л) ×3', price: 24000, months: 24 },
  { id: 'eq_6', name: 'холодильник (бытовой)', price: 10000, months: 24 },
  { id: 'eq_7', name: 'индукционная плита', price: 3000, months: 24 },
  { id: 'eq_8', name: 'комбайн кухонный', price: 10000, months: 24 },
  { id: 'eq_9', name: 'весы и мерный инвентарь', price: 500, months: 24 },
  { id: 'eq_10', name: 'гастроёмкости, контейнеры', price: 4000, months: 24 },
  { id: 'eq_11', name: 'посуда (джиггеры, ложки, тёрки, ножи)', price: 2000, months: 24 },
  { id: 'eq_12', name: 'шейкеры', price: 2000, months: 24 },
];

export function empty_month(month: string, opex: opex_category[]): month_data {
  const o: Record<string, number> = {};
  for (const c of opex) o[c.id] = 0;
  return { month, sales: {}, retailSales: {}, opex: o, cashFlow: { inflowInvestments: 0, outflowCapex: 0 }, transactions: [] };
}

export function default_finance_state(): finance_state {
  return {
    version: FINANCE_STATE_VERSION,
    materials: default_materials.map((m) => ({ ...m })),
    techCards: default_tech_cards.map((c) => ({ ...c, sizes: Object.fromEntries(Object.entries(c.sizes).map(([k, s]) => [k, { ...s, ingredients: { ...s.ingredients }, packaging: { ...s.packaging } }])) })),
    opexCategories: default_opex_categories.map((c) => ({ ...c })),
    stockCategories: default_stock_categories.map((c) => ({ ...c })),
    equipments: default_equipments.map((e) => ({ ...e })),
    monthsData: [empty_month(current_month_id(), default_opex_categories)],
    stockMovements: [],
    stockAudit: [],
    stockCountedAt: null,
    taxRate: 8,
    ndflRate: 13,
    taxRegime: 'ausn_income',
    taxPatentMonthly: 0,
    insuranceRate: 0,
    injuryMonthly: AUSN_INJURY_MONTHLY,
    businessPlan: default_business_plan(),
  };
}

export function needs_stock_count(state: finance_state) {
  return !state.stockCountedAt;
}

/* ------------------------------------------------------------------ */
/* нормализация / импорт бэкапа Bubble Manager                          */
/* ------------------------------------------------------------------ */

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function is_bubble_manager_backup(value: unknown): value is Partial<finance_state> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.materials) && Array.isArray(v.techCards) && Array.isArray(v.monthsData);
}

/** приводит любой сохранённый/импортированный объект к актуальной схеме */
function read_prep_steps(raw: unknown): prep_step[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const steps: prep_step[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const p = row as Partial<prep_step>;
    const title = String(p.title || '').trim();
    const materialId = p.materialId ? String(p.materialId) : '';
    if (!title && !materialId) continue;
    const qty = Number(p.qty);
    steps.push({
      id: String(p.id || new_id('step')),
      title,
      ...(p.hint ? { hint: String(p.hint).trim() } : {}),
      ...(materialId ? { materialId } : {}),
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
    });
  }
  return steps.length ? steps : undefined;
}

export function normalize_finance_state(raw: unknown): finance_state {
  const def = default_finance_state();
  if (!raw || typeof raw !== 'object') return def;
  const v = raw as Partial<finance_state> & Record<string, unknown>;

  let materials: material[] = Array.isArray(v.materials)
    ? v.materials
        .filter((m) => m && typeof m === 'object' && m.id && !material_is_infinite(m))
        .map((m) => ({
          id: String(m.id),
          name: String(m.name || m.id).trim(),
          category: String(m.category || 'raw').trim() || 'raw',
          unit: (['g', 'kg', 'ml', 'L', 'pcs'] as const).includes(m.unit) ? m.unit : 'pcs',
          costPerUnit: num(m.costPerUnit),
          ...(m.minStock != null ? { minStock: num(m.minStock) } : {}),
        }))
        .filter((m) => !material_is_infinite(m))
    : def.materials;
  {
    const have = new Set(materials.map((m) => m.id));
    for (const extra of default_materials) {
      if (!have.has(extra.id) && !material_is_infinite(extra)) materials.push({ ...extra });
    }
    materials = materials.map((m) => {
      const cat = stock_category_for(m);
      return cat === m.category ? m : { ...m, category: cat };
    });
  }

  const techCards: tech_card[] = Array.isArray(v.techCards)
    ? v.techCards
        .filter((t) => t && typeof t === 'object' && t.id)
        .map((t) => {
          const sizes: Record<string, tech_card_size> = {};
          for (const [key, s] of Object.entries((t.sizes ?? {}) as Record<string, Partial<tech_card_size>>)) {
            if (!s) continue;
            const legacy_steps = read_prep_steps((s as { steps?: unknown }).steps);
            sizes[key] = {
              volume: num(s.volume),
              ingredients: { ...(s.ingredients ?? {}) },
              packaging: { ...(s.packaging ?? {}) },
              ...(legacy_steps?.length ? { steps: legacy_steps } : {}),
              ...(s.manual === true ? { manual: true } : {}),
            };
          }
          let card_steps = read_prep_steps((t as { steps?: unknown }).steps);
          if (!card_steps?.length) {
            const preferred =
              sizes['500']?.steps ??
              Object.keys(sizes)
                .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))
                .map((k) => sizes[k]?.steps)
                .find((s) => s?.length);
            if (preferred?.length) card_steps = preferred.map((s) => ({ ...s }));
          }
          return {
            id: String(t.id),
            name: String(t.name || t.id).trim(),
            menu_item_id: t.menu_item_id ?? null,
            ...(typeof t.cold === 'boolean' ? { cold: t.cold } : {}),
            ...(typeof t.hot === 'boolean' ? { hot: t.hot } : {}),
            ...(card_steps?.length ? { steps: card_steps } : {}),
            sizes,
          };
        })
    : def.techCards.map((c) => ({
        ...c,
        sizes: Object.fromEntries(
          Object.entries(c.sizes).map(([k, s]) => [k, { ...s, ingredients: { ...s.ingredients }, packaging: { ...s.packaging } }]),
        ),
      }));

  for (const card of techCards) {
    const hint = recipe_hint(card);
    for (const size of Object.values(card.sizes)) {
      size.ingredients = remap_ingredients(size.ingredients, hint);
    }
    if (!card.menu_item_id) {
      const def_card = default_tech_cards.find((d) => d.id === card.id || names_match(d.name, card.name));
      if (def_card?.menu_item_id) card.menu_item_id = def_card.menu_item_id;
    }
  }

  fold_dual_temp_tech_cards(techCards);

  const removedTechCardIds = Array.isArray(v.removedTechCardIds)
    ? [...new Set(v.removedTechCardIds.map((id) => String(id)).filter(Boolean))]
    : [];
  const removed_tech = new Set(removedTechCardIds);

  for (const d of default_tech_cards) {
    if (tech_card_is_removed(removed_tech, d)) continue;
    const existing =
      techCards.find((c) => c.id === d.id) ||
      techCards.find((c) => (d.menu_item_id && c.menu_item_id === d.menu_item_id) || names_match(c.name, d.name));
    if (existing) {
      const empty = !Object.values(existing.sizes).some((s) =>
        Object.keys(s.ingredients).some((id) => !is_infinite_stock(id))
      );
      const lumped = Object.values(existing.sizes).some((s) => Object.keys(s.ingredients).some((id) => lumped_material_ids.has(id)));
      if (empty || lumped) overlay_recipe(existing, d);
      continue;
    }
    techCards.push({
      ...d,
      sizes: Object.fromEntries(
        Object.entries(d.sizes).map(([k, s]) => [k, { ...s, ingredients: { ...s.ingredients }, packaging: { ...s.packaging } }]),
      ),
    });
  }

  const opexCategories: opex_category[] = Array.isArray(v.opexCategories) && v.opexCategories.length
    ? v.opexCategories.map((c) => ({ id: String(c.id), name: String(c.name || c.id) }))
    : def.opexCategories;

  const raw_cats = (v as { stockCategories?: unknown }).stockCategories;
  const stockCategories: stock_category[] = merge_stock_categories(
    Array.isArray(raw_cats) && raw_cats.length
      ? raw_cats
          .filter((c) => c && typeof c === 'object' && (c as stock_category).id)
          .map((c) => {
            const row = c as Partial<stock_category>;
            return {
              id: String(row.id),
              name: String(row.name || row.id).trim(),
              color: String(row.color || FINDER_LABEL_COLORS[0]),
            };
          })
      : default_stock_categories.map((c) => ({ ...c })),
  );

  const equipments: equipment[] = Array.isArray(v.equipments)
    ? v.equipments.map((e) => ({
        id: String(e.id),
        name: String(e.name || ''),
        price: num(e.price),
        months: Math.max(0, Math.round(num(e.months, 24))),
      }))
    : def.equipments;

  const monthsData: month_data[] = Array.isArray(v.monthsData) && v.monthsData.length
    ? v.monthsData
        .filter((m) => m && /^\d{4}-\d{2}$/.test(String(m.month)))
        .map((m) => {
          const payroll_raw = (m as { payroll?: unknown }).payroll;
          const payroll: payroll_line[] | undefined = Array.isArray(payroll_raw)
            ? payroll_raw
                .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
                .map((l) => ({
                  id: String(l.id || l.sellerId || new_id('pay')),
                  ...(l.sellerId ? { sellerId: String(l.sellerId) } : {}),
                  name: String(l.name || 'сотрудник').trim() || 'сотрудник',
                  amount: Math.max(0, Math.round(num(l.amount))),
                  withNdfl: Boolean(l.withNdfl),
                  kind: parse_payroll_kind(l.kind),
                  ...(String(l.note || '').trim()
                    ? { note: String(l.note).trim().slice(0, 200) }
                    : {}),
                }))
            : undefined;
          return {
            month: String(m.month),
            sales: (m.sales ?? {}) as month_data['sales'],
            retailSales: (m.retailSales ?? {}) as month_data['retailSales'],
            opex: (m.opex ?? {}) as Record<string, number>,
            ...(payroll?.length ? { payroll } : {}),
            cashFlow: {
              inflowInvestments: num(m.cashFlow?.inflowInvestments),
              outflowCapex: num(m.cashFlow?.outflowCapex),
            },
            transactions: Array.isArray(m.transactions)
              ? m.transactions.map((t): transaction => ({
                  id: String(t.id || new_id('tx')),
                  day: Math.min(31, Math.max(1, Math.round(num(t.day, 1)))),
                  type: t.type === 'income' ? 'income' : 'expense',
                  category: String(t.category || 'other_expense'),
                  amount: num(t.amount),
                  description: String(t.description || ''),
                  ...(t.materialId ? { materialId: String(t.materialId) } : {}),
                  ...(t.quantity != null ? { quantity: num(t.quantity) } : {}),
                }))
              : [],
          };
        })
        .sort((a, b) => a.month.localeCompare(b.month))
    : def.monthsData;

  const incoming_version = num(v.version, 0);
  const wipe_warehouse = incoming_version < 3;

  const stockMovements: stock_movement[] = wipe_warehouse
    ? []
    : Array.isArray(v.stockMovements)
      ? v.stockMovements
          .filter((s) => s && s.materialId)
          .map((s) => ({
            id: String(s.id || new_id('mv')),
            date: String(s.date || new Date().toISOString()),
            type: (['in', 'out', 'writeoff', 'adjust', 'sale', 'staff'] as const).includes(s.type as stock_movement_type)
              ? (s.type as stock_movement_type)
              : 'in',
            materialId: String(s.materialId),
            qty: num(s.qty),
            ...(s.total != null ? { total: num(s.total) } : {}),
            ...(s.note ? { note: String(s.note) } : {}),
            ...(s.transactionId ? { transactionId: String(s.transactionId) } : {}),
            ...(s.orderId ? { orderId: String(s.orderId) } : {}),
            ...(s.actorId ? { actorId: String(s.actorId) } : {}),
            ...(s.actorName ? { actorName: String(s.actorName) } : {}),
            ...(s.actorRole === 'admin' || s.actorRole === 'seller' ? { actorRole: s.actorRole } : {}),
          }))
      : [];

  const stockAudit: stock_audit_entry[] = Array.isArray((v as { stockAudit?: unknown }).stockAudit)
    ? ((v as { stockAudit?: unknown[] }).stockAudit as unknown[])
        .filter((row) => row && typeof row === 'object')
        .map((row) => {
          const s = row as Partial<stock_audit_entry>;
          const role: stock_actor_role = s.actorRole === 'seller' ? 'seller' : 'admin';
          const action: stock_audit_action =
            s.action === 'inventory' || s.action === 'writeoff' || s.action === 'receipt' || s.action === 'delete_movement'
              ? s.action
              : 'adjust';
          return {
            id: String(s.id || new_id('aud')),
            at: String(s.at || new Date().toISOString()),
            actorId: String(s.actorId || 'unknown'),
            actorName: String(s.actorName || 'неизвестно'),
            actorRole: role,
            action,
            ...(s.materialId ? { materialId: String(s.materialId) } : {}),
            ...(s.materialName ? { materialName: String(s.materialName) } : {}),
            ...(s.qtyBefore != null ? { qtyBefore: num(s.qtyBefore) } : {}),
            ...(s.qtyAfter != null ? { qtyAfter: num(s.qtyAfter) } : {}),
            ...(s.note ? { note: String(s.note) } : {}),
            ...(s.movementId ? { movementId: String(s.movementId) } : {}),
          };
        })
    : [];

  const stockCountedAt = wipe_warehouse ? null : v.stockCountedAt ? String(v.stockCountedAt) : null;

  {
    const moved = new Set(stockMovements.map((m) => m.materialId));
    materials = materials.filter((m) => {
      if (material_is_infinite(m)) return false;
      if (!lumped_material_ids.has(m.id)) return true;
      return moved.has(m.id);
    });
  }

  const base: finance_state = {
    version: FINANCE_STATE_VERSION,
    materials,
    techCards,
    removedTechCardIds,
    opexCategories,
    stockCategories,
    equipments,
    monthsData,
    stockMovements,
    stockAudit,
    stockCountedAt,
    taxRate: num(v.taxRate, 8),
    ndflRate: num(v.ndflRate, 13),
    taxRegime: TAX_REGIMES.some((r) => r.id === v.taxRegime) ? (v.taxRegime as tax_regime) : 'ausn_income',
    taxPatentMonthly: num((v as { taxPatentMonthly?: unknown }).taxPatentMonthly),
    insuranceRate: (() => {
      const regime_id = TAX_REGIMES.some((r) => r.id === v.taxRegime) ? (v.taxRegime as tax_regime) : 'ausn_income';
      const meta = tax_regime_of({ taxRegime: regime_id });
      if (!meta.show_insurance) return 0;
      const raw = (v as { insuranceRate?: unknown }).insuranceRate;
      return raw == null || raw === '' ? meta.insurance_rate : num(raw);
    })(),
    injuryMonthly: (() => {
      const regime_id = TAX_REGIMES.some((r) => r.id === v.taxRegime) ? (v.taxRegime as tax_regime) : 'ausn_income';
      const meta = tax_regime_of({ taxRegime: regime_id });
      if (!meta.show_injury) return 0;
      const raw = (v as { injuryMonthly?: unknown }).injuryMonthly;
      if (raw == null || raw === '') return meta.injury_monthly;
      return Math.max(0, Math.round(num(raw)));
    })(),
    customTaxes: (() => {
      const raw = (v as { customTaxes?: unknown }).customTaxes;
      if (!Array.isArray(raw)) return undefined;
      const lines = raw
        .filter((t) => t && typeof t === 'object')
        .map((t): custom_tax_line => {
          const o = t as Record<string, unknown>;
          const basis_raw = String(o.basis || 'revenue');
          const basis: custom_tax_basis =
            basis_raw === 'profit' || basis_raw === 'payroll' || basis_raw === 'fixed'
              ? basis_raw
              : 'revenue';
          return {
            id: String(o.id || new_id('ctx')),
            name: String(o.name || '').trim() || 'налог',
            basis,
            value: Math.max(0, num(o.value)),
          };
        });
      return lines.length ? lines : undefined;
    })(),
    businessPlan: normalize_business_plan((v as { businessPlan?: unknown }).businessPlan),
  };
  return backfill_opex_months(base);
}

function clamp_pct(n: number, max = 100) {
  return Math.min(max, Math.max(0, n));
}

function normalize_reinvest_split(raw: unknown): plan_reinvest_split {
  const d = DEFAULT_REINVEST_SPLIT;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Partial<plan_reinvest_split>;
  const marketing = Math.max(0, num(o.marketing, d.marketing));
  const equipment = Math.max(0, num(o.equipment, d.equipment));
  const stock = Math.max(0, num(o.stock, d.stock));
  const reserve = Math.max(0, num(o.reserve, d.reserve));
  const sum = marketing + equipment + stock + reserve;
  if (sum <= 0) return { ...d };
  // нормализуем к 100, чтобы слайдеры не ломали долю
  return {
    marketing: Math.round((marketing / sum) * 1000) / 10,
    equipment: Math.round((equipment / sum) * 1000) / 10,
    stock: Math.round((stock / sum) * 1000) / 10,
    reserve: Math.round((reserve / sum) * 1000) / 10,
  };
}

export function normalize_business_plan(raw: unknown): business_plan {
  const def = default_business_plan();
  if (!raw || typeof raw !== 'object') return def;
  const o = raw as Partial<business_plan>;
  const horizon_raw = Number(o.horizonMonths);
  const horizonMonths: plan_horizon =
    horizon_raw === 3 || horizon_raw === 12 ? horizon_raw : 6;
  const strategy_raw = String(o.strategyId || '');
  const strategyId: plan_strategy_id =
    strategy_raw === 'launch' ||
    strategy_raw === 'conservative' ||
    strategy_raw === 'growth' ||
    strategy_raw === 'custom' ||
    strategy_raw === 'balanced'
      ? strategy_raw
      : 'launch';
  return {
    horizonMonths,
    monthlyNetTarget: Math.max(0, Math.round(num(o.monthlyNetTarget))),
    strategyId,
    reinvestPct: clamp_pct(num(o.reinvestPct, def.reinvestPct)),
    reinvestSplit: normalize_reinvest_split(o.reinvestSplit),
    trafficGrowthPct: clamp_pct(num(o.trafficGrowthPct, def.trafficGrowthPct), 50),
    ticketGrowthPct: clamp_pct(num(o.ticketGrowthPct, def.ticketGrowthPct), 30),
    mixTiltPct: clamp_pct(num(o.mixTiltPct, def.mixTiltPct), 15),
    assumedCupsPerDay: Math.max(0, Math.min(500, Math.round(num(o.assumedCupsPerDay)))),
  };
}

/* ------------------------------------------------------------------ */
/* связка с меню сайта                                                  */
/* ------------------------------------------------------------------ */

function norm_name(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stop_words = new Set(['с', 'и', 'со', 'на', 'в', 'классический', 'классик', 'бабл', 'ти', 'чай', 'льдом', 'тапиокой']);

function name_tokens(s: string) {
  return norm_name(s)
    .split(' ')
    .filter((w) => w && !stop_words.has(w))
    .map((w) => w.replace(/(ый|ий|ой|ая|яя|ое|ее|ые|ие|ами|ами|ой|ей|ов|ев|ах|ях|а|я|ы|и|у|ю|е|о)$/u, ''))
    .filter((w) => w.length >= 3);
}

function names_match(a: string, b: string) {
  if (norm_name(a) === norm_name(b)) return true;
  const na = norm_name(a);
  const nb = norm_name(b);
  for (const [from, to] of menu_name_aliases) {
    const nf = norm_name(from);
    const nt = norm_name(to);
    if ((na.includes(nf) && nb.includes(nt)) || (nb.includes(nf) && na.includes(nt))) return true;
  }
  const ta = name_tokens(a);
  const tb = name_tokens(b);
  if (!ta.length || !tb.length) return false;
  const common = ta.filter((w) => tb.some((x) => x.startsWith(w) || w.startsWith(x)));
  return common.length >= Math.min(ta.length, tb.length) && common.length >= 1;
}

/** ключи размеров при создании техкарты: из volumes или дефолт 500/650 */
export function menu_item_size_keys(item: menu_item): string[] {
  const vols = get_item_volumes(item).map((v) => Math.round(Number(v.ml) || 0)).filter((v) => v > 0);
  if (!vols.length) return ['500', '650'];
  return vols.map(String);
}

export function size_label(key: string) {
  if (key === '1') return 'порция';
  if (/^\d+$/.test(key)) return `${key} мл`;
  return key;
}

/** цена позиции меню для размера-ключа */
export function menu_price_for_size(item: menu_item, key: string) {
  if (!/^\d+$/.test(key) || key === '1') return item.price;
  const vol = get_item_volumes(item).find((v) => String(Math.round(Number(v.ml) || 0)) === key);
  return item.price + (vol?.add ?? 0);
}

export function size_key_for_item(
  card: tech_card,
  opts: { volume?: string; name?: string; price?: number; menu_item?: menu_item }
): string {
  const keys = Object.keys(card.sizes);
  if (!keys.length) return '1';
  const from_volume = opts.volume && /^\d+$/.test(opts.volume) ? opts.volume : undefined;
  const from_name = /(\d{3,4})\s*мл/i.exec(opts.name || '')?.[1];
  const vol = from_volume || from_name;
  if (vol && card.sizes[vol]) return vol;
  if (opts.menu_item && keys.length > 1 && opts.price != null && opts.price > 0) {
    let best = keys[0];
    let best_diff = Infinity;
    for (const k of keys) {
      const diff = Math.abs(menu_price_for_size(opts.menu_item, k) - opts.price);
      if (diff < best_diff) {
        best = k;
        best_diff = diff;
      }
    }
    return best;
  }
  return keys.slice().sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b))[0];
}

/** «таро/матча со льдом» → одна техкарта с cold+hot */
const dual_temp_led_fold: Record<string, { base_id: string; name: string }> = {
  'taro-led': { base_id: 'taro', name: 'таро' },
  'matcha-latte-tiger-led': { base_id: 'matcha-latte-tiger', name: 'матча латте' },
  tc_taro_led: { base_id: 'taro', name: 'таро' },
  tc_matcha_latte_led: { base_id: 'matcha-latte-tiger', name: 'матча латте' },
};

function size_has_recipe(size: tech_card_size | undefined) {
  if (!size) return false;
  return (
    Object.keys(size.ingredients || {}).length > 0 ||
    Object.keys(size.packaging || {}).length > 0 ||
    Boolean(size.steps?.length)
  );
}

function card_has_recipe(card: tech_card) {
  return Object.values(card.sizes).some(size_has_recipe) || Boolean(card.steps?.length);
}

function fold_dual_temp_tech_cards(cards: tech_card[]) {
  const drop = new Set<string>();
  for (const led of [...cards]) {
    const fold =
      (led.menu_item_id && dual_temp_led_fold[led.menu_item_id]) ||
      dual_temp_led_fold[led.id] ||
      (/со льдом/i.test(led.name) && /таро/i.test(led.name)
        ? { base_id: 'taro', name: 'таро' }
        : /со льдом/i.test(led.name) && /матча/i.test(led.name)
          ? { base_id: 'matcha-latte-tiger', name: 'матча латте' }
          : null);
    if (!fold) continue;
    if (led.menu_item_id === fold.base_id) {
      led.cold = true;
      led.hot = true;
      led.name = fold.name;
      continue;
    }
    const base =
      cards.find((c) => c.menu_item_id === fold.base_id && !drop.has(c.id)) ||
      cards.find((c) => c.id === `tc_${fold.base_id}` && !drop.has(c.id));
    if (!base) {
      led.menu_item_id = fold.base_id;
      led.name = fold.name;
      led.cold = true;
      led.hot = true;
      continue;
    }
    if (!card_has_recipe(base) && card_has_recipe(led)) {
      base.sizes = Object.fromEntries(
        Object.entries(led.sizes).map(([k, s]) => [
          k,
          {
            volume: s.volume,
            ingredients: { ...s.ingredients },
            packaging: { ...s.packaging },
            ...(s.steps?.length ? { steps: s.steps.map((st) => ({ ...st })) } : {}),
            ...(s.manual ? { manual: true } : {}),
          },
        ])
      );
      if (led.steps?.length && !base.steps?.length) {
        base.steps = led.steps.map((s) => ({ ...s }));
      }
    }
    base.cold = true;
    base.hot = true;
    base.name = fold.name;
    base.menu_item_id = fold.base_id;
    drop.add(led.id);
  }
  for (const id of drop) {
    const i = cards.findIndex((c) => c.id === id);
    if (i >= 0) cards.splice(i, 1);
  }
  for (const card of cards) {
    if (card.menu_item_id === 'taro' || card.menu_item_id === 'matcha-latte-tiger') {
      card.cold = true;
      card.hot = true;
    }
  }
}

/**
 * скрещивает техкарты с меню сайта:
 * — техкарта с похожим названием привязывается к позиции;
 * — для позиций меню без техкарты создаётся пустая техкарта с объёмами из меню.
 * ничего не удаляет — техкарты без позиции в меню остаются как есть.
 */
export function tech_card_removed_keys(card: { id: string; name: string; menu_item_id?: string | null }): string[] {
  const keys = [card.id];
  if (card.menu_item_id) keys.push(card.menu_item_id, `tc_${card.menu_item_id}`);
  const name = card.name.trim().toLowerCase();
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function tech_card_is_removed(
  removed: Set<string>,
  card: { id: string; name: string; menu_item_id?: string | null }
): boolean {
  return tech_card_removed_keys(card).some((key) => removed.has(key));
}

export function sync_tech_cards_with_menu(state: finance_state, menu: menu_item[]): finance_state {
  const cards = state.techCards.map((c) => ({ ...c, sizes: { ...c.sizes } }));
  const removed = new Set(state.removedTechCardIds ?? []);
  const skip_categories = new Set(['комбо', 'закуски', 'добавки']);
  const linked = new Set(cards.map((c) => c.menu_item_id).filter(Boolean) as string[]);
  /** card id → (старый ключ размера → новый), чтобы перенести продажи */
  const size_renames = new Map<string, Record<string, string>>();

  for (const item of menu) {
    if (skip_categories.has(item.category)) continue;
    if (tech_card_is_removed(removed, { id: `tc_${item.id}`, name: item.name, menu_item_id: item.id })) continue;
    const keys = menu_item_size_keys(item);

    const existing = cards.find((c) => c.menu_item_id === item.id);
    const existing_empty =
      existing &&
      !Object.values(existing.sizes).some(
        (s) => Object.keys(s.ingredients).length > 0 || Object.keys(s.packaging).length > 0
      );
    if (existing && !existing_empty) {
      linked.add(item.id);
      continue;
    }
    if (linked.has(item.id) && !existing_empty) continue;
    const unlinked = cards.filter((c) => c !== existing && !c.menu_item_id);
    const by_name =
      unlinked.find((c) => norm_name(c.name) === norm_name(item.name)) ??
      unlinked.find((c) => names_match(c.name, item.name));
    if (by_name) {
      const target = existing_empty && existing ? existing : by_name;
      target.menu_item_id = item.id;
      target.name = item.name;
      // переносим старые размеры S/M/L на объёмы меню, если они ещё не заданы
      const legacy = ['S', 'M', 'L'].filter((k) => by_name.sizes[k]);
      if (legacy.length && !keys.some((k) => target.sizes[k] && Object.keys(target.sizes[k].ingredients).length)) {
        const renames: Record<string, string> = {};
        const legacy_vol = (k: string) => by_name.sizes[k].volume || { S: 400, M: 500, L: 650 }[k] || 0;
        const next_sizes: Record<string, tech_card_size> = { ...target.sizes };
        keys.forEach((k) => {
          const target_vol = Number(k) || 0;
          const src_key = legacy.reduce((best, cur) =>
            Math.abs(legacy_vol(cur) - target_vol) < Math.abs(legacy_vol(best) - target_vol) ? cur : best
          );
          const src = by_name.sizes[src_key];
          next_sizes[k] = {
            volume: target_vol || src.volume,
            ingredients: { ...src.ingredients },
            packaging: { ...src.packaging },
            ...(src.steps?.length ? { steps: src.steps.map((s) => ({ ...s, id: new_id('step') })) } : {}),
          };
          if (!renames[src_key]) renames[src_key] = k;
        });
        for (const k of legacy) {
          if (!renames[k]) {
            const nearest = keys.reduce((best, cur) =>
              Math.abs((Number(cur) || 0) - legacy_vol(k)) < Math.abs((Number(best) || 0) - legacy_vol(k)) ? cur : best
            );
            renames[k] = nearest;
          }
          delete next_sizes[k];
        }
        target.sizes = next_sizes;
        size_renames.set(target.id, renames);
      } else if (existing_empty && existing) {
        existing.sizes = Object.fromEntries(
          Object.entries(by_name.sizes).map(([k, s]) => [
            k,
            {
              ...s,
              ingredients: { ...s.ingredients },
              packaging: { ...s.packaging },
              ...(s.steps?.length ? { steps: s.steps.map((st) => ({ ...st, id: new_id('step') })) } : {}),
            },
          ])
        );
      }
      if (existing_empty && existing && by_name !== existing) {
        const idx = cards.indexOf(by_name);
        if (idx >= 0) cards.splice(idx, 1);
      }
      linked.add(item.id);
      continue;
    }

    // тёплая/холодная пара: если «чёрный сахар» уже связан — «чёрный сахар со льдом» копирует состав
    const sibling_id = item.id.endsWith('-led') ? item.id.slice(0, -4) : `${item.id}-led`;
    const sibling_card = cards.find((c) => c.menu_item_id === sibling_id);
    if (sibling_card) {
      const sizes: Record<string, tech_card_size> = {};
      for (const k of keys) {
        const src = sibling_card.sizes[k] ?? Object.values(sibling_card.sizes)[0];
        sizes[k] = src
          ? { volume: Number(k) || src.volume, ingredients: { ...src.ingredients }, packaging: { ...src.packaging } }
          : { volume: Number(k) || 0, ingredients: {}, packaging: {} };
      }
      if (existing) {
        existing.sizes = sizes;
        existing.name = item.name;
      } else {
        cards.push({ id: `tc_${item.id}`, name: item.name, menu_item_id: item.id, sizes });
      }
      linked.add(item.id);
      continue;
    }

    if (existing) {
      linked.add(item.id);
      continue;
    }

    const sizes: Record<string, tech_card_size> = {};
    for (const k of keys) {
      sizes[k] = { volume: Number(k) || 0, ingredients: {}, packaging: {} };
    }
    cards.push({ id: `tc_${item.id}`, name: item.name, menu_item_id: item.id, sizes });
    linked.add(item.id);
  }

  if (!size_renames.size) return { ...state, techCards: cards };

  // переносим продажи со старых ключей размеров на новые (суммируем, если попали в один)
  const monthsData = state.monthsData.map((m) => {
    let changed = false;
    const sales = { ...m.sales };
    for (const [card_id, renames] of size_renames) {
      const by_size = sales[card_id];
      if (!by_size) continue;
      const next: Record<string, sales_cell> = {};
      for (const [key, cell] of Object.entries(by_size)) {
        const to = renames[key] ?? key;
        const prev = next[to];
        next[to] = prev
          ? {
              qty: prev.qty + cell.qty,
              price: prev.qty + cell.qty > 0 ? Math.round((prev.price * prev.qty + cell.price * cell.qty) / (prev.qty + cell.qty)) : cell.price,
            }
          : { ...cell };
      }
      sales[card_id] = next;
      changed = true;
    }
    return changed ? { ...m, sales } : m;
  });

  return { ...state, techCards: cards, monthsData };
}

/* ------------------------------------------------------------------ */
/* расчёты                                                              */
/* ------------------------------------------------------------------ */

export function material_by_id(state: finance_state) {
  return new Map(state.materials.map((m) => [m.id, m]));
}

/** стоимость `qty` базовых единиц материала */
export function material_cost(state: finance_state, material_id: string, qty: number) {
  const m = state.materials.find((x) => x.id === material_id);
  if (!m) return 0;
  return cost_per_base_unit(m) * qty;
}

const auto_large_ml = '650';
const auto_base_ml = '500';

function qty_stays(mat: material | undefined) {
  return !mat || base_unit(mat.unit) === 'pcs' || mat.category === 'packaging';
}

/** 650 мл из 500: сырьё по объёму, штучная упаковка без изменений */
export function derive_size_from_base(base: tech_card_size, to_ml: number, materials: material[]): tech_card_size {
  const from_ml = base.volume || Number(auto_base_ml) || 1;
  const k = from_ml > 0 ? to_ml / from_ml : 1;
  const by_id = new Map(materials.map((m) => [m.id, m]));
  const scale_qty = (id: string, q: number) =>
    qty_stays(by_id.get(id)) ? q : Math.round(q * k * 10) / 10;
  const steps = base.steps?.map((step) => ({
    ...step,
    id: `${step.id}@${to_ml}`,
    qty:
      step.qty > 0 && !(step.materialId && qty_stays(by_id.get(step.materialId)))
        ? Math.round(step.qty * k * 10) / 10
        : step.qty,
  }));
  return {
    volume: to_ml,
    ingredients: Object.fromEntries(Object.entries(base.ingredients).map(([id, q]) => [id, scale_qty(id, q)])),
    packaging: { ...base.packaging },
    ...(steps?.length ? { steps } : {}),
  };
}

/** 650 мл без ручной правки всегда считается от 500 мл */
export function effective_card_size(card: tech_card, key: string, materials: material[]): tech_card_size | undefined {
  const stored = card.sizes[key];
  if (key === auto_large_ml && card.sizes[auto_base_ml] && !stored?.manual) {
    return derive_size_from_base(card.sizes[auto_base_ml], Number(auto_large_ml), materials);
  }
  return stored;
}

export function tech_card_cost(state: finance_state, card: tech_card, size_key: string) {
  const s = effective_card_size(card, size_key, state.materials);
  if (!s) return 0;
  let total = 0;
  for (const [id, q] of Object.entries(s.ingredients)) total += material_cost(state, id, q);
  for (const [id, q] of Object.entries(s.packaging)) total += material_cost(state, id, q);
  return total;
}

export function amortization_per_month(state: finance_state) {
  return state.equipments.reduce((s, e) => s + (e.months > 0 ? e.price / e.months : 0), 0);
}

export type month_summary = {
  month: string;
  revenue: number;
  /** расчётная себестоимость по плану продаж */
  cogs_calc: number;
  /** себестоимость продаж: расход сырья по заказам × средняя цена закупки */
  cogs_sold: number;
  /** напитки персонала */
  cogs_staff: number;
  /** списания (брак / порча) */
  cogs_writeoff: number;
  /** то, что идёт в прибыль: факт со склада, иначе план */
  cogs: number;
  /** фактические закупки сырья из операций (это касса, не себестоимость) */
  cogs_actual: number;
  opex: number;
  salary: number;
  amortization: number;
  other_income: number;
  other_expense: number;
  capex: number;
  investments: number;
  tax: number;
  ndfl: number;
  insurance: number;
  ebitda: number;
  net_profit: number;
  margin: number;
  /** точка безубыточности, ₽ выручки */
  break_even: number;
  drinks_sold: number;
};

export function summarize_month(state: finance_state, m: month_data): month_summary {
  let revenue = 0;
  let cogs_calc = 0;
  let drinks_sold = 0;
  for (const card of state.techCards) {
    const sales = m.sales[card.id];
    if (!sales) continue;
    for (const [key, cell] of Object.entries(sales)) {
      if (!cell) continue;
      revenue += cell.price * cell.qty;
      cogs_calc += tech_card_cost(state, card, key) * cell.qty;
      drinks_sold += cell.qty;
    }
  }
  for (const [mid, cell] of Object.entries(m.retailSales ?? {})) {
    const mat = state.materials.find((x) => x.id === mid);
    if (!mat || !cell || cell.qty <= 0) continue;
    revenue += cell.price * cell.qty;
    cogs_calc += mat.costPerUnit * cell.qty;
  }

  const resolved_opex = resolve_month_opex(state, m.month);
  let opex = 0;
  for (const val of Object.values(resolved_opex)) {
    opex += Number(val) || 0;
  }
  const pay = resolve_month_payroll(state, { ...m, opex: resolved_opex });
  const salary = pay.net;
  // если payroll задан — opex.salary мог отстать; в итоге opex держим согласованным с ФОТ
  if (Array.isArray(m.payroll) && m.payroll.length) {
    const sid = salary_opex_id(state);
    const prev_sal = Number(resolved_opex[sid]) || 0;
    opex += salary - prev_sal;
  }

  let cogs_actual = 0;
  let other_income = 0;
  let other_expense = 0;
  let capex_tx = 0;
  let invest_tx = 0;
  for (const t of m.transactions ?? []) {
    const a = Number(t.amount) || 0;
    if (t.category === 'material') cogs_actual += a;
    else if (t.category === 'capex') capex_tx += a;
    else if (t.category === 'investment') invest_tx += a;
    else if (t.category === 'other_income') other_income += a;
    else if (t.category === 'other_expense') other_expense += a;
    else if (state.opexCategories.some((c) => c.id === t.category)) other_expense += a;
  }

  const from_stock = movement_cogs(state, m.month);
  const cogs_sold = from_stock.sold;
  const cogs_staff = from_stock.staff;
  const cogs_writeoff = from_stock.writeoff;
  // себестоимость напитков — по техкартам (рецепт × цена сырья);
  // складские sale-движения — сверка; персонал/списания — отдельно из склада
  const cogs = cogs_calc > 0 ? cogs_calc : cogs_sold;

  const amortization = amortization_per_month(state);
  const ndfl = pay.ndfl;
  const insurance = pay.insurance + injury_monthly_of(state);

  return close_month_summary(state, {
    month: m.month,
    revenue,
    cogs_calc,
    cogs_sold,
    cogs_staff,
    cogs_writeoff,
    cogs,
    cogs_actual,
    opex,
    salary,
    amortization,
    other_income,
    other_expense,
    capex: (m.cashFlow?.outflowCapex ?? 0) + capex_tx,
    investments: (m.cashFlow?.inflowInvestments ?? 0) + invest_tx,
    ndfl,
    insurance,
    drinks_sold,
  });
}

export type cashflow_row = month_summary & {
  inflow: number;
  outflow: number;
  net: number;
  opening: number;
  closing: number;
  cogs_cash: number;
  cogs_is_actual: boolean;
};

/** факт выручки из заказов перекрывает план — дашборд и деньги считают одно и то же */
type month_totals = Omit<month_summary, 'tax' | 'ebitda' | 'net_profit' | 'margin' | 'break_even'>;

function close_month_summary(state: finance_state, s: month_totals): month_summary {
  const deductible = s.cogs + s.opex + s.other_expense + s.cogs_staff + s.cogs_writeoff;
  const tax = compute_month_tax(state, s.revenue, deductible);
  const ebitda = s.revenue - s.cogs - s.opex - s.other_expense - s.cogs_staff - s.cogs_writeoff + s.other_income;
  const net_profit = ebitda - s.amortization - tax - s.ndfl - s.insurance;
  const margin_pct = s.revenue > 0 ? (s.revenue - s.cogs) / s.revenue : 0;
  const regime = tax_regime_of(state);
  const fixed =
    s.opex +
    s.amortization +
    s.ndfl +
    s.insurance +
    s.other_expense +
    s.cogs_staff +
    s.cogs_writeoff -
    s.other_income +
    (regime.kind === 'patent' ? tax : 0) +
    (regime.id === 'custom'
      ? custom_business_tax(
          custom_taxes_of(state).filter((t) => t.basis === 'fixed'),
          0,
          0
        )
      : 0);
  let contribution = margin_pct;
  if (regime.id === 'custom') {
    let pct_rev = 0;
    let pct_profit = 0;
    for (const t of custom_taxes_of(state)) {
      const v = Math.max(0, Number(t.value) || 0) / 100;
      if (t.basis === 'revenue') pct_rev += v;
      else if (t.basis === 'profit') pct_profit += v;
    }
    contribution = margin_pct * (1 - pct_profit) - pct_rev;
  } else if (regime.kind === 'income') contribution = margin_pct - regime.rate / 100;
  else if (regime.kind === 'profit') contribution = margin_pct * (1 - regime.rate / 100);
  return {
    ...s,
    tax,
    ebitda,
    net_profit,
    margin: s.revenue > 0 ? net_profit / s.revenue : 0,
    break_even: contribution > 0 ? fixed / contribution : 0,
  };
}

/** факт выручки из заказов перекрывает план — дашборд и деньги считают одно и то же */
export function with_fact_revenue(s: month_summary, fact_revenue: number, state: finance_state): month_summary {
  if (!(fact_revenue > 0)) return s;
  return close_month_summary(state, { ...s, revenue: fact_revenue });
}

/**
 * Точка безубыточности — не «сумма расходов», а выручка в месяц, при которой чистая ≈ 0.
 * fixed = ФОТ + пост. opex + амортизация + ндфл (+ персонал/списания, если передали);
 * contribution = доля выручки после себеса и налога с продаж.
 */
export function break_even_revenue(
  state: finance_state,
  month: string,
  opts?: { margin_pct?: number; staff_writeoff_monthly?: number }
): number {
  const md = state.monthsData.find((m) => m.month === month);
  if (!md) return 0;
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
  const fixed =
    opex +
    amort +
    pay.ndfl +
    pay.insurance +
    injury_monthly_of(state) +
    Math.max(0, opts?.staff_writeoff_monthly ?? 0) +
    (regime.kind === 'patent' ? Number(state.taxPatentMonthly) || 0 : 0) +
    (regime.id === 'custom'
      ? custom_business_tax(
          custom_taxes_of(state).filter((t) => t.basis === 'fixed'),
          0,
          0
        )
      : 0);
  const margin_pct = Math.max(0, opts?.margin_pct ?? 0);
  let contribution = margin_pct;
  if (regime.id === 'custom') {
    let pct_rev = 0;
    let pct_profit = 0;
    for (const t of custom_taxes_of(state)) {
      const v = Math.max(0, Number(t.value) || 0) / 100;
      if (t.basis === 'revenue') pct_rev += v;
      else if (t.basis === 'profit') pct_profit += v;
    }
    contribution = margin_pct * (1 - pct_profit) - pct_rev;
  } else if (regime.kind === 'income') contribution = margin_pct - regime.rate / 100;
  else if (regime.kind === 'profit') contribution = margin_pct * (1 - regime.rate / 100);
  return contribution > 0 ? fixed / contribution : 0;
}

/** полные суммы месяца (не доля периода) — для подсказок «в месяце» */
export function month_fixed_totals(state: finance_state, month: string) {
  const md = state.monthsData.find((m) => m.month === month);
  if (!md) return { opex: 0, salary: 0, other_opex: 0, ndfl: 0, insurance: 0, amort: 0 };
  const resolved_opex = resolve_month_opex(state, month);
  const pay = resolve_month_payroll(state, { ...md, opex: resolved_opex });
  let opex = 0;
  for (const val of Object.values(resolved_opex)) opex += Number(val) || 0;
  if (Array.isArray(md.payroll) && md.payroll.length) {
    const sid = salary_opex_id(state);
    opex += pay.net - (Number(resolved_opex[sid]) || 0);
  }
  return {
    opex,
    salary: pay.net,
    other_opex: Math.max(0, opex - pay.net),
    ndfl: pay.ndfl,
    insurance: pay.insurance + injury_monthly_of(state),
    amort: amortization_per_month(state),
  };
}

export function with_fact_cashflow(row: cashflow_row, live: month_summary): cashflow_row {
  const inflow = live.revenue + live.investments + live.other_income;
  const outflow = row.cogs_cash + live.opex + live.tax + live.ndfl + live.insurance + live.capex + live.other_expense;
  const net = inflow - outflow;
  return { ...row, ...live, inflow, outflow, net, opening: row.opening, closing: row.opening + net };
}

export function cashflow_table(state: finance_state): cashflow_row[] {
  let opening = 0;
  const rows: cashflow_row[] = [];
  for (const m of state.monthsData) {
    const s = summarize_month(state, m);
    const cogs_is_actual = s.cogs_actual > 0;
    const cogs_cash = cogs_is_actual ? s.cogs_actual : s.cogs_calc;
    const inflow = s.revenue + s.investments + s.other_income;
    const outflow = cogs_cash + s.opex + s.tax + s.ndfl + s.insurance + s.capex + s.other_expense;
    const net = inflow - outflow;
    rows.push({ ...s, inflow, outflow, net, opening, closing: opening + net, cogs_cash, cogs_is_actual });
    opening += net;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* склад                                                                */
/* ------------------------------------------------------------------ */

export type stock_row = {
  material: material;
  /** остаток в базовых единицах */
  qty: number;
  /** оценка остатка, ₽ — по средней цене закупки */
  value: number;
  low: boolean;
  last_in?: string;
};

/** YYYY-MM-DD из ISO или уже из даты */
export function day_key(iso: string) {
  return iso.slice(0, 10);
}

export function moscow_today(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

export function add_days(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function days_in_month(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function each_day(from: string, to: string) {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 400; d = add_days(d, 1)) out.push(d);
  return out;
}

const month_genitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function format_period(from: string, to: string) {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const [, am, ad] = a.split('-').map(Number);
  const [, bm, bd] = b.split('-').map(Number);
  if (a === b) return `${bd} ${month_genitive[bm - 1]}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${ad}–${bd} ${month_genitive[bm - 1]}`;
  return `${ad} ${month_genitive[am - 1].slice(0, 3)}. — ${bd} ${month_genitive[bm - 1].slice(0, 3)}.`;
}

export function prorate_fixed(state: finance_state, from: string, to: string) {
  let opex = 0;
  let salary = 0;
  let ndfl = 0;
  let insurance = 0;
  const amort_m = amortization_per_month(state);
  let amort = 0;
  for (const d of each_day(from, to)) {
    const month = d.slice(0, 7);
    const dim = Math.max(1, days_in_month(month));
    const md = state.monthsData.find((m) => m.month === month);
    if (md) {
      const resolved_opex = resolve_month_opex(state, month);
      const pay = resolve_month_payroll(state, { ...md, opex: resolved_opex });
      salary += pay.net / dim;
      ndfl += pay.ndfl / dim;
      insurance += (pay.insurance + injury_monthly_of(state)) / dim;
      let month_opex = 0;
      for (const val of Object.values(resolved_opex)) month_opex += Number(val) || 0;
      if (Array.isArray(md.payroll) && md.payroll.length) {
        const sid = salary_opex_id(state);
        const prev_sal = Number(resolved_opex[sid]) || 0;
        month_opex += pay.net - prev_sal;
      }
      opex += month_opex / dim;
    }
    amort += amort_m / dim;
  }
  return { opex, salary, amort, ndfl, insurance };
}

export function summarize_period(
  state: finance_state,
  from: string,
  to: string,
  opts?: { revenue?: number; sales?: Record<string, Record<string, sales_cell>> }
): month_summary {
  const fixed = prorate_fixed(state, from, to);
  const from_stock = movement_cogs_range(state, from, to);
  let revenue = opts?.revenue ?? 0;
  let cogs_calc = 0;
  let drinks_sold = 0;
  if (opts?.sales) {
    for (const card of state.techCards) {
      const sales = opts.sales[card.id];
      if (!sales) continue;
      for (const [key, cell] of Object.entries(sales)) {
        if (!cell) continue;
        if (!(opts.revenue && opts.revenue > 0)) revenue += cell.price * cell.qty;
        cogs_calc += tech_card_cost(state, card, key) * cell.qty;
        drinks_sold += cell.qty;
      }
    }
  }
  // чистая: себес каждого проданного напитка по техкарте; склад — персонал и списания
  const cogs = cogs_calc > 0 ? cogs_calc : from_stock.sold;
  let patent = 0;
  for (const d of each_day(from, to)) {
    patent += (Number(state.taxPatentMonthly) || 0) / Math.max(1, days_in_month(d.slice(0, 7)));
  }
  const tax_state = tax_regime_of(state).kind === 'patent' ? { ...state, taxPatentMonthly: patent } : state;
  const purchases = warehouse_purchases_range(state, from, to);
  return close_month_summary(tax_state, {
    month: (from <= to ? to : from).slice(0, 7),
    revenue,
    cogs_calc,
    cogs_sold: from_stock.sold,
    cogs_staff: from_stock.staff,
    cogs_writeoff: from_stock.writeoff,
    cogs,
    cogs_actual: purchases,
    opex: fixed.opex,
    salary: fixed.salary,
    amortization: fixed.amort,
    other_income: 0,
    other_expense: 0,
    capex: 0,
    investments: 0,
    ndfl: fixed.ndfl,
    insurance: fixed.insurance,
    drinks_sold,
  });
}

/** пн=0 … вс=6 в Europe/Moscow для YYYY-MM-DD */
export function msk_weekday_mon0(ymd: string): number {
  const utc = new Date(`${ymd}T12:00:00+03:00`);
  if (Number.isNaN(utc.getTime())) return 0;
  return (utc.getUTCDay() + 6) % 7;
}

export type month_net_projection = {
  projected_net: number;
  projected_revenue: number;
  mtd_net: number;
  mtd_revenue: number;
  remaining_net: number;
  remaining_revenue: number;
  remaining_days: number;
  rentability: number;
  method: 'closed' | 'rhythm' | 'linear';
};

/**
 * Ориентир чистой на весь месяц:
 * факт MTD + остаток дней по ритму недели (ср. выручка пн…вс) × маржа MTD − известные фикс. расходы.
 * Если ритма нет — линейный темп по дням.
 */
export function project_month_net(
  state: finance_state,
  opts: {
    month_id: string;
    today: string;
    mtd: month_summary;
    /** ср. выручка по дням недели (пн=0…вс=6), обычно из store_rhythm.weekday */
    weekday_avg_revenue?: number[] | null;
  }
): month_net_projection {
  const { month_id, today, mtd } = opts;
  const dim = days_in_month(month_id);
  const month_end = `${month_id}-${String(dim).padStart(2, '0')}`;
  const elapsed = Math.max(1, Number(today.slice(8)) || 1);
  const mtd_net = mtd.net_profit;
  const mtd_revenue = mtd.revenue;
  const closed = today >= month_end || elapsed >= dim;

  if (closed) {
    const rentability = mtd_revenue > 0 ? mtd_net / mtd_revenue : 0;
    return {
      projected_net: Math.round(mtd_net),
      projected_revenue: Math.round(mtd_revenue),
      mtd_net: Math.round(mtd_net),
      mtd_revenue: Math.round(mtd_revenue),
      remaining_net: 0,
      remaining_revenue: 0,
      remaining_days: 0,
      rentability,
      method: 'closed',
    };
  }

  const tomorrow = add_days(today, 1);
  const rest_days = tomorrow <= month_end ? each_day(tomorrow, month_end) : [];
  const remaining_days = rest_days.length;

  const avgs = opts.weekday_avg_revenue;
  let remaining_revenue = 0;
  let method: month_net_projection['method'] = 'linear';

  if (avgs && avgs.length >= 7 && remaining_days > 0) {
    let sum = 0;
    for (const d of rest_days) sum += Math.max(0, Number(avgs[msk_weekday_mon0(d)]) || 0);
    if (sum > 0) {
      remaining_revenue = sum;
      method = 'rhythm';
    }
  }

  if (method === 'linear') {
    const daily = mtd_revenue / elapsed;
    remaining_revenue = daily * remaining_days;
  }

  const cogs_rate = mtd_revenue > 0 ? mtd.cogs / mtd_revenue : 0;
  const remaining_cogs = remaining_revenue * cogs_rate;
  const staff_wo_daily = (mtd.cogs_staff + mtd.cogs_writeoff) / elapsed;
  const remaining_staff_wo = staff_wo_daily * remaining_days;

  const fixed =
    remaining_days > 0
      ? prorate_fixed(state, tomorrow, month_end)
      : { opex: 0, salary: 0, amort: 0, ndfl: 0, insurance: 0 };

  const regime = tax_regime_of(state);
  let remaining_tax = 0;
  if (regime.kind === 'patent') {
    remaining_tax = ((Number(state.taxPatentMonthly) || 0) / dim) * remaining_days;
  } else {
    remaining_tax = compute_month_tax(
      state,
      remaining_revenue,
      remaining_cogs + fixed.opex + remaining_staff_wo
    );
  }

  const remaining_net =
    remaining_revenue -
    remaining_cogs -
    remaining_staff_wo -
    fixed.opex -
    fixed.amort -
    remaining_tax -
    fixed.ndfl -
    fixed.insurance;

  const projected_net = mtd_net + remaining_net;
  const projected_revenue = mtd_revenue + remaining_revenue;
  const rentability = projected_revenue > 0 ? projected_net / projected_revenue : 0;

  return {
    projected_net: Math.round(projected_net),
    projected_revenue: Math.round(projected_revenue),
    mtd_net: Math.round(mtd_net),
    mtd_revenue: Math.round(mtd_revenue),
    remaining_net: Math.round(remaining_net),
    remaining_revenue: Math.round(remaining_revenue),
    remaining_days,
    rentability,
    method,
  };
}

/** себестоимость движений за период по текущей средней цене закупки */
export function movement_cogs_range(state: finance_state, from: string, to: string) {
  let sold = 0;
  let staff = 0;
  let writeoff = 0;
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  for (const mv of state.stockMovements) {
    const d = day_key(mv.date);
    if (d < a || d > b) continue;
    const mat = state.materials.find((x) => x.id === mv.materialId);
    if (!mat) continue;
    const cost = mv.qty * cost_per_base_unit(mat);
    if (mv.type === 'sale') sold += cost;
    else if (mv.type === 'staff') staff += cost;
    else if (mv.type === 'writeoff') writeoff += cost;
  }
  return { sold, staff, writeoff };
}

/** сколько реально заплатили за закупки на склад за период (касса, не себестоимость продаж) */
export function warehouse_purchases_range(state: finance_state, from: string, to: string) {
  let spent = 0;
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const mats = new Map(state.materials.map((m) => [m.id, m]));
  for (const mv of state.stockMovements) {
    const d = day_key(mv.date);
    if (d < a || d > b) continue;
    if (mv.type !== 'in') continue;
    const mat = mats.get(mv.materialId);
    if (!mat || material_is_infinite(mat)) continue;
    spent += Number(mv.total) > 0 ? Number(mv.total) : mv.qty * cost_per_base_unit(mat);
  }
  return spent;
}

export function in_day_range(iso: string, from: string, to: string) {
  const d = day_key(iso);
  return d >= from && d <= to;
}

/** остаток = последняя инвентаризация (или 0) + поступления − списания − расход по заказам − персонал */
export function stock_qty_map(state: finance_state, as_of?: string): Map<string, number> {
  const cutoff = as_of ? day_key(as_of) : null;
  const qty = new Map<string, number>();
  const sorted = [...state.stockMovements].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const mv of sorted) {
    if (cutoff && day_key(mv.date) > cutoff) continue;
    const cur = qty.get(mv.materialId) ?? 0;
    if (mv.type === 'in') qty.set(mv.materialId, cur + mv.qty);
    else if (mv.type === 'adjust') qty.set(mv.materialId, mv.qty);
    else qty.set(mv.materialId, cur - mv.qty);
  }
  return qty;
}

export type warehouse_money = {
  /** деньги, которые ещё лежат на складе */
  on_hand: number;
  /** всё, что зашло: поступления и граммы инвентаризации по цене закупки */
  spent: number;
  /** себестоимость сырья, которое ушло в напитки */
  realized: number;
  /** списания и ужатие остатка при пересчёте */
  lost: number;
};

/**
 * граммы и литры переводятся в деньги по цене закупки.
 * инвентаризация без накладной тоже считается тратой: вбитые граммы стоят своих рублей.
 */
export function warehouse_money(state: finance_state, as_of?: string): warehouse_money {
  const cutoff = as_of ? day_key(as_of) : null;
  const mats = new Map(state.materials.map((m) => [m.id, m]));
  const qty = new Map<string, number>();
  let spent = 0;
  let realized = 0;
  let lost = 0;

  const sorted = [...state.stockMovements].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const mv of sorted) {
    if (cutoff && day_key(mv.date) > cutoff) continue;
    const mat = mats.get(mv.materialId);
    if (!mat || material_is_infinite(mat)) continue;
    const cost = cost_per_base_unit(mat);
    const prev = qty.get(mv.materialId) ?? 0;
    if (mv.type === 'in') {
      qty.set(mv.materialId, prev + mv.qty);
      const priced = Number(mv.total) > 0 ? Number(mv.total) : mv.qty * cost;
      spent += priced;
    } else if (mv.type === 'adjust') {
      const delta = mv.qty - prev;
      qty.set(mv.materialId, mv.qty);
      if (delta > 0) spent += delta * cost;
      else lost += -delta * cost;
    } else if (mv.type === 'sale' || mv.type === 'staff') {
      qty.set(mv.materialId, prev - mv.qty);
      realized += mv.qty * cost;
    } else {
      qty.set(mv.materialId, prev - mv.qty);
      lost += mv.qty * cost;
    }
  }

  let on_hand = 0;
  for (const [id, q] of qty) {
    const mat = mats.get(id);
    if (!mat || q <= 0) continue;
    on_hand += q * cost_per_base_unit(mat);
  }

  const round = (n: number) => Math.round(n);
  return { on_hand: round(on_hand), spent: round(spent), realized: round(realized), lost: round(lost) };
}

export function stock_levels(state: finance_state, as_of?: string): stock_row[] {
  const qty = stock_qty_map(state, as_of);
  const last_in = new Map<string, string>();
  for (const mv of state.stockMovements) {
    if (mv.type !== 'in') continue;
    if (as_of && day_key(mv.date) > day_key(as_of)) continue;
    const prev = last_in.get(mv.materialId);
    if (!prev || mv.date > prev) last_in.set(mv.materialId, mv.date);
  }
  return state.materials
    .filter((m) => !material_is_infinite(m))
    .map((m) => {
      const q = qty.get(m.id) ?? 0;
      return {
        material: m,
        qty: q,
        value: Math.max(0, q) * cost_per_base_unit(m),
        low: m.minStock != null && q <= m.minStock,
        last_in: last_in.get(m.id),
      };
    });
}

/** себестоимость движений месяца по текущей средней цене закупки */
export function movement_cogs(state: finance_state, month: string) {
  let sold = 0;
  let staff = 0;
  let writeoff = 0;
  for (const mv of state.stockMovements) {
    if (!mv.date.startsWith(month)) continue;
    const mat = state.materials.find((x) => x.id === mv.materialId);
    if (!mat) continue;
    const cost = mv.qty * cost_per_base_unit(mat);
    if (mv.type === 'sale') sold += cost;
    else if (mv.type === 'staff') staff += cost;
    else if (mv.type === 'writeoff') writeoff += cost;
  }
  return { sold, staff, writeoff };
}

/** фактический расход сырья за месяц из движений склада */
export function consumption_from_movements(state: finance_state, month: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const mv of state.stockMovements) {
    if (!mv.date.startsWith(month)) continue;
    if (mv.type !== 'sale' && mv.type !== 'staff') continue;
    out.set(mv.materialId, (out.get(mv.materialId) ?? 0) + mv.qty);
  }
  return out;
}

export function movements_in_range(state: finance_state, from: string, to: string) {
  return state.stockMovements.filter((mv) => in_day_range(mv.date, from, to));
}

function ensure_month(state: finance_state, month: string): finance_state {
  if (state.monthsData.some((m) => m.month === month)) return state;
  const seed = empty_month(month, state.opexCategories);
  const donor = find_opex_donor(state, month);
  if (donor) {
    // постоянные с донора; ФОТ не копируем — у каждого месяца свой
    for (const [id, val] of Object.entries(donor.opex ?? {})) {
      if (is_salary_opex(id)) continue;
      seed.opex[id] = Number(val) || 0;
    }
  }
  return {
    ...state,
    monthsData: [...state.monthsData, seed].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function apply_opex_to_all_months(state: finance_state, opex: Record<string, number>): finance_state {
  const shared: Record<string, number> = {};
  for (const [id, val] of Object.entries(opex)) {
    if (is_salary_opex(id)) continue;
    shared[id] = Number(val) || 0;
  }
  return {
    ...state,
    monthsData: state.monthsData.map((m) => ({ ...m, opex: { ...m.opex, ...shared } })),
  };
}

export function add_month(state: finance_state, month: string) {
  return ensure_month(state, month);
}

export function update_month(state: finance_state, month: string, fn: (m: month_data) => month_data): finance_state {
  const s = ensure_month(state, month);
  return { ...s, monthsData: s.monthsData.map((m) => (m.month === month ? fn(m) : m)) };
}

/** журнал склада (движения + кто/что/когда) живёт не дольше этого */
export const STOCK_KEEP_MONTHS = 3;

export function stock_keep_since(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - STOCK_KEEP_MONTHS, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
}

export function stock_keep_since_iso(now = new Date()): string {
  return stock_keep_since(now).toISOString();
}

export function stock_keep_since_day(now = new Date()): string {
  const d = stock_keep_since(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prev_day_key(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function snap_id(day: string, materialId: string) {
  return `mv_snap_${day}_${materialId}`;
}

export function filter_stock_audit(entries: stock_audit_entry[] | undefined, now = new Date()): stock_audit_entry[] {
  const since = stock_keep_since_iso(now);
  return (entries ?? []).filter((e) => e.at >= since);
}

/** старше 3 месяцев выкидываем; остаток на границе сворачиваем в срез, чтобы факт не обнулился */
export function prune_stock_retention(state: finance_state, now = new Date()): finance_state {
  const since_day = stock_keep_since_day(now);
  const since_iso = stock_keep_since_iso(now);
  const stockAudit = (state.stockAudit ?? []).filter((e) => e.at >= since_iso);

  const recent = state.stockMovements.filter((m) => day_key(m.date) >= since_day);
  const has_old = state.stockMovements.some((m) => day_key(m.date) < since_day);
  const audit_same = stockAudit.length === (state.stockAudit ?? []).length;

  if (!has_old && audit_same) return state;

  const as_of = prev_day_key(since_day);
  const opening = has_old ? stock_qty_map(state, as_of) : new Map<string, number>();
  const snaps: stock_movement[] = [];
  if (has_old) {
    for (const [materialId, qty] of opening) {
      if (!Number.isFinite(qty) || qty === 0) continue;
      snaps.push({
        id: snap_id(as_of, materialId),
        date: `${as_of}T12:00:00.000Z`,
        type: 'adjust',
        materialId,
        qty,
        note: 'срез — старше 3 месяцев',
      });
    }
    snaps.sort((a, b) => a.id.localeCompare(b.id));
  }

  const stockMovements = [...snaps, ...recent.filter((m) => !m.id.startsWith('mv_snap_'))];
  return { ...state, stockMovements, stockAudit };
}

export function stock_retention_changed(before: finance_state, after: finance_state) {
  if (before.stockMovements.length !== after.stockMovements.length) return true;
  if ((before.stockAudit?.length ?? 0) !== (after.stockAudit?.length ?? 0)) return true;
  for (let i = 0; i < before.stockMovements.length; i++) {
    if (before.stockMovements[i].id !== after.stockMovements[i].id) return true;
  }
  const a = before.stockAudit ?? [];
  const b = after.stockAudit ?? [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return true;
  }
  return false;
}

export function actor_on_movement(actor?: stock_actor | null): Partial<stock_movement> {
  if (!actor) return {};
  return { actorId: actor.id, actorName: actor.name, actorRole: actor.role };
}

function audit_actor(actor?: stock_actor | null): Pick<stock_audit_entry, 'actorId' | 'actorName' | 'actorRole'> {
  return {
    actorId: actor?.id || 'unknown',
    actorName: actor?.name?.trim() || 'неизвестно',
    actorRole: actor?.role === 'seller' ? 'seller' : 'admin',
  };
}

export function push_stock_audit(state: finance_state, entries: stock_audit_entry[]): finance_state {
  if (!entries.length) return state;
  const since = stock_keep_since_iso();
  const prev = (state.stockAudit ?? []).filter((e) => e.at >= since);
  return { ...state, stockAudit: [...prev, ...entries.filter((e) => e.at >= since)] };
}

export type receipt_input = {
  materialId: string;
  /** количество в единицах закупки (кг / л / шт …) */
  quantity: number;
  /** сумма партии, ₽ */
  total: number;
  date: string;
  note?: string;
  /** обновить цену закупки материала по этой партии */
  update_price?: boolean;
  actor?: stock_actor | null;
};

/** поступление на склад: движение + операция закупки (попадает в ДДС и P&L) */
export function apply_receipt(state: finance_state, input: receipt_input): finance_state {
  const mat = state.materials.find((m) => m.id === input.materialId);
  if (!mat || input.quantity <= 0) return state;
  const date = input.date || new Date().toISOString();
  const month = date.slice(0, 7);
  const day = Math.max(1, Math.min(31, Number(date.slice(8, 10)) || 1));
  const tx_id = new_id('tx');
  const movement: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'in',
    materialId: mat.id,
    qty: input.quantity * base_per_unit(mat.unit),
    total: input.total,
    transactionId: tx_id,
    ...(input.note ? { note: input.note } : {}),
    ...actor_on_movement(input.actor),
  };
  let next = update_month(state, month, (m) => ({
    ...m,
    transactions: [
      ...(m.transactions ?? []),
      {
        id: tx_id,
        day,
        type: 'expense',
        category: 'material',
        materialId: mat.id,
        quantity: input.quantity,
        amount: input.total,
        description: input.note || `поступление: ${mat.name}`,
      },
    ],
  }));
  next = { ...next, stockMovements: [...next.stockMovements, movement] };
  next = push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: date,
      ...audit_actor(input.actor),
      action: 'receipt',
      materialId: mat.id,
      materialName: mat.name,
      qtyAfter: movement.qty,
      note: input.note,
      movementId: movement.id,
    },
  ]);
  if (input.total > 0 && input.quantity > 0) {
    const on_hand_base = Math.max(0, stock_qty_map(state).get(mat.id) ?? 0);
    const per = base_per_unit(mat.unit);
    const on_hand_units = on_hand_base / per;
    const batch_price = input.total / input.quantity;
    const next_cost =
      input.update_price === false
        ? mat.costPerUnit
        : on_hand_units > 0
          ? (on_hand_units * mat.costPerUnit + input.quantity * batch_price) / (on_hand_units + input.quantity)
          : batch_price;
    next = {
      ...next,
      materials: next.materials.map((m) =>
        m.id === mat.id ? { ...m, costPerUnit: Math.round(next_cost * 100) / 100 } : m
      ),
    };
  }
  return next;
}

/** списание (порча, брак, проба) — количество в базовых единицах */
export function apply_writeoff(
  state: finance_state,
  materialId: string,
  qty: number,
  note: string,
  date = new Date().toISOString(),
  actor?: stock_actor | null
): finance_state {
  if (qty <= 0) return state;
  const mat = state.materials.find((m) => m.id === materialId);
  const before = stock_qty_map(state).get(materialId) ?? 0;
  const movement: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'writeoff',
    materialId,
    qty,
    ...(note ? { note } : {}),
    ...actor_on_movement(actor),
  };
  return push_stock_audit(
    { ...state, stockMovements: [...state.stockMovements, movement] },
    [
      {
        id: new_id('aud'),
        at: date,
        ...audit_actor(actor),
        action: 'writeoff',
        materialId,
        materialName: mat?.name,
        qtyBefore: before,
        qtyAfter: before - qty,
        note,
        movementId: movement.id,
      },
    ]
  );
}

/** инвентаризация — выставляет фактический остаток (базовые единицы) */
export function apply_adjust(
  state: finance_state,
  materialId: string,
  actual_qty: number,
  note = 'инвентаризация',
  date = new Date().toISOString(),
  actor?: stock_actor | null,
  action: 'adjust' | 'inventory' = 'adjust'
): finance_state {
  const mat = state.materials.find((m) => m.id === materialId);
  const before = stock_qty_map(state).get(materialId) ?? 0;
  const movement: stock_movement = {
    id: new_id('mv'),
    date,
    type: 'adjust',
    materialId,
    qty: actual_qty,
    note,
    ...actor_on_movement(actor),
  };
  return push_stock_audit(
    { ...state, stockMovements: [...state.stockMovements, movement] },
    [
      {
        id: new_id('aud'),
        at: date,
        ...audit_actor(actor),
        action,
        materialId,
        materialName: mat?.name,
        qtyBefore: before,
        qtyAfter: actual_qty,
        note,
        movementId: movement.id,
      },
    ]
  );
}

export function apply_inventory_count(
  state: finance_state,
  facts: { materialId: string; qty: number }[],
  date = new Date().toISOString(),
  actor?: stock_actor | null
): finance_state {
  const next = facts.reduce(
    (s, f) => apply_adjust(s, f.materialId, f.qty, 'инвентаризация', date, actor, 'inventory'),
    state
  );
  return { ...next, stockCountedAt: date };
}

export function remove_stock_movement(
  state: finance_state,
  id: string,
  actor?: stock_actor | null
): finance_state {
  const mv = state.stockMovements.find((m) => m.id === id);
  let next: finance_state = { ...state, stockMovements: state.stockMovements.filter((m) => m.id !== id) };
  if (mv?.transactionId) {
    next = {
      ...next,
      monthsData: next.monthsData.map((m) => ({
        ...m,
        transactions: (m.transactions ?? []).filter((t) => t.id !== mv.transactionId),
      })),
    };
  }
  if (!mv) return next;
  const mat = state.materials.find((m) => m.id === mv.materialId);
  return push_stock_audit(next, [
    {
      id: new_id('aud'),
      at: new Date().toISOString(),
      ...audit_actor(actor),
      action: 'delete_movement',
      materialId: mv.materialId,
      materialName: mat?.name,
      note: mv.note || mv.type,
      movementId: mv.id,
    },
  ]);
}

export const sales_consumption_note = (month: string) => `расход по продажам ${month}`;

function add_recipe(out: Map<string, number>, size: tech_card_size | undefined, qty: number) {
  if (!size || qty <= 0) return;
  for (const [id, q] of Object.entries(size.ingredients)) {
    if (is_infinite_stock(id)) continue;
    out.set(id, (out.get(id) ?? 0) + q * qty);
  }
  for (const [id, q] of Object.entries(size.packaging)) out.set(id, (out.get(id) ?? 0) + q * qty);
}

export function consumption_from_sales_map(
  state: finance_state,
  sales: Record<string, Record<string, sales_cell>>,
  retail?: Record<string, sales_cell>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const card of state.techCards) {
    const by_size = sales[card.id];
    if (!by_size) continue;
    for (const [key, cell] of Object.entries(by_size)) {
      add_recipe(out, effective_card_size(card, key, state.materials), cell?.qty ?? 0);
    }
  }
  for (const [mid, cell] of Object.entries(retail ?? {})) {
    if (cell?.qty) out.set(mid, (out.get(mid) ?? 0) + cell.qty);
  }
  return out;
}

export function consumption_for_items(
  state: finance_state,
  items: order_stock_item[],
  menu: menu_item[] = []
): Map<string, number> {
  const out = new Map<string, number>();
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  const card_by_menu = new Map(state.techCards.filter((c) => c.menu_item_id).map((c) => [c.menu_item_id as string, c]));
  // комбо раскладываем на выбранные напитки — себестоимость и остатки по ним
  const expanded = expand_items_for_stock(items, menu);
  for (const item of expanded) {
    const card = card_by_menu.get(item.menu_id);
    if (!card) continue;
    const key = size_key_for_item(card, {
      volume: item.volume,
      name: item.name,
      price: item.price,
      menu_item: menu_by_id.get(item.menu_id),
    });
    add_recipe(out, effective_card_size(card, key, state.materials), item.quantity);
  }
  return out;
}

export function reverse_order_consumption(state: finance_state, orderId: string): finance_state {
  if (!orderId) return state;
  return {
    ...state,
    stockMovements: state.stockMovements.filter((mv) => mv.orderId !== orderId),
  };
}

/** списывает сырьё по техкарте заказа; повторный вызов заменяет прошлый расход этого заказа */
export function apply_order_consumption(
  state: finance_state,
  opts: { orderId: string; items: order_stock_item[]; date?: string; kind?: 'sale' | 'staff'; menu?: menu_item[] }
): finance_state {
  const kind = opts.kind ?? (opts.items.every((i) => i.kind === 'staff') ? 'staff' : 'sale');
  const date = opts.date || new Date().toISOString();
  let next = reverse_order_consumption(state, opts.orderId);
  const cons = consumption_for_items(next, opts.items, opts.menu ?? []);
  const added: stock_movement[] = [];
  for (const [materialId, qty] of cons) {
    if (qty <= 0) continue;
    added.push({
      id: new_id('mv'),
      date,
      type: kind,
      materialId,
      qty,
      orderId: opts.orderId,
      note: kind === 'staff' ? `персонал ${opts.orderId.slice(0, 8)}` : `заказ ${opts.orderId.slice(0, 8)}`,
    });
  }
  return { ...next, stockMovements: [...next.stockMovements, ...added] };
}

/**
 * подтягивает расход из факта заказов за месяц.
 * не трогает списания по конкретным заказам (orderId) — дописывает только разницу.
 */
export function apply_fact_consumption(
  state: finance_state,
  month: string,
  fact_sales: Record<string, Record<string, sales_cell>>
): finance_state {
  const needed = consumption_from_sales_map(state, fact_sales);
  const already = new Map<string, number>();
  for (const mv of state.stockMovements) {
    if (!mv.date.startsWith(month)) continue;
    if (mv.type !== 'sale' && mv.type !== 'staff') continue;
    if (!mv.orderId) continue;
    already.set(mv.materialId, (already.get(mv.materialId) ?? 0) + mv.qty);
  }
  const note = sales_consumption_note(month);
  const kept = state.stockMovements.filter((mv) => !(mv.type === 'sale' && !mv.orderId && mv.note === note));
  const [y, mo] = month.split('-').map(Number);
  const last_day = new Date(y, mo, 0).getDate();
  const date = `${month}-${String(last_day).padStart(2, '0')}T21:00:00.000Z`;
  const added: stock_movement[] = [];
  for (const [materialId, qty] of needed) {
    const rest = Math.max(0, qty - (already.get(materialId) ?? 0));
    if (rest <= 0) continue;
    added.push({ id: new_id('mv'), date, type: 'sale', materialId, qty: rest, note });
  }
  return { ...state, stockMovements: [...kept, ...added] };
}

/** @deprecated используйте apply_fact_consumption — план не равен расходу склада */
export function apply_sales_consumption(state: finance_state, month: string): finance_state {
  const m = state.monthsData.find((x) => x.month === month);
  if (!m) return state;
  return apply_fact_consumption(state, month, m.sales);
}

/** расчётный расход сырья по плану продаж месяца */
export function consumption_by_sales(state: finance_state, m: month_data): Map<string, number> {
  return consumption_from_sales_map(state, m.sales, m.retailSales);
}
