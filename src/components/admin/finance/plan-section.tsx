'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  days_in_month,
  default_business_plan,
  format_rub,
  month_label,
  size_label,
  type business_plan,
  type plan_horizon,
  type plan_strategy_id,
  type sales_cell,
} from '@/lib/finance/model';
import {
  CAPACITY_SOURCE_HINT,
  FEASIBILITY_LABEL,
  STRATEGY_PRESETS,
  apply_month_cells_to_state,
  apply_roadmap_to_state,
  apply_strategy_preset,
  build_baseline,
  build_plan_verdict,
  build_roadmap,
  drink_plan_preview,
  patch_business_plan,
  prev_month_id,
  solve_month,
  spot_revenue_share,
  type roadmap_feasibility,
  type roadmap_month,
} from '@/lib/finance/plan-engine';
import type { section_props } from '@/components/admin/finance/use-finance';
import type { store_rhythm } from '@/lib/customer-analytics';
import SalesSection from '@/components/admin/finance/sales-section';
import {
  Card,
  NumInput,
  StatCard,
  btn_primary,
  btn_secondary,
  chip_active,
  chip_idle,
  field_class,
} from '@/components/admin/finance/ui';

type fact_response = {
  month: string;
  orders: number;
  revenue: number;
  sales: Record<string, Record<string, sales_cell>>;
  by_spot?: { spot_id: string | null; revenue: number; orders: number; label: string }[];
  rhythm?: store_rhythm;
  unmatched?: { menu_id: string; name: string; qty: number; revenue: number }[];
  error?: string;
};

function feasibility_tone(f: roadmap_feasibility) {
  if (f === 'easy') return 'text-emerald-600';
  if (f === 'ok') return 'text-neutral-800';
  if (f === 'stretch') return 'text-amber-600';
  return 'text-red-500';
}

function feasibility_bg(f: roadmap_feasibility) {
  if (f === 'easy') return 'border-emerald-200 bg-emerald-50/80';
  if (f === 'ok') return 'border-neutral-200 bg-white';
  if (f === 'stretch') return 'border-amber-200 bg-amber-50/80';
  return 'border-red-200 bg-red-50/70';
}

function plan_of(state: section_props['state']): business_plan {
  return { ...default_business_plan(), ...(state.businessPlan ?? {}) };
}

export default function PlanSection(props: section_props) {
  const { state, set_state, month, spot_id = '' } = props;
  const bp = plan_of(state);
  const [fact, set_fact] = useState<fact_response | null>(null);
  const [prev_fact, set_prev_fact] = useState<fact_response | null>(null);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [applied_msg, set_applied_msg] = useState('');
  const [selected_roadmap_month, set_selected_roadmap_month] = useState(month);

  useEffect(() => {
    set_selected_roadmap_month(month);
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    set_loading(true);
    const spot_q = spot_id ? `&spot_id=${encodeURIComponent(spot_id)}` : '';
    const prev = prev_month_id(month);
    Promise.all([
      fetch(`/api/admin/finance/sales?month=${month}${spot_q}`, { credentials: 'same-origin' }).then((r) =>
        r.json()
      ),
      fetch(`/api/admin/finance/sales?month=${prev}${spot_q}`, { credentials: 'same-origin' }).then((r) =>
        r.json()
      ),
    ])
      .then(([cur, prev_body]: [fact_response, fact_response]) => {
        if (cancelled) return;
        if (cur.error) throw new Error(cur.error);
        set_fact(cur);
        set_prev_fact(prev_body.error ? null : prev_body);
        set_error('');
      })
      .catch((e) => {
        if (!cancelled) set_error(e instanceof Error ? e.message : 'не удалось загрузить продажи');
      })
      .finally(() => {
        if (!cancelled) set_loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, spot_id]);

  const share = useMemo(
    () => spot_revenue_share(fact?.by_spot, spot_id),
    [fact?.by_spot, spot_id]
  );

  const baseline = useMemo(() => {
    if (!fact) return null;
    return build_baseline({
      state,
      month,
      fact_sales: fact.sales ?? {},
      fact_revenue: fact.revenue ?? 0,
      menu: props.menu,
      spot_share: share,
      rhythm: fact.rhythm,
      days: days_in_month(month),
      prev_month_revenue: prev_fact?.revenue ?? 0,
      prev_fact_sales: prev_fact?.sales,
      assumed_cups_per_day: bp.assumedCupsPerDay,
    });
  }, [fact, prev_fact, state, month, props.menu, share, bp.assumedCupsPerDay]);

  const roadmap = useMemo(() => {
    if (!baseline) return [] as roadmap_month[];
    return build_roadmap({
      state,
      baseline,
      plan: bp,
      start_month: month,
    });
  }, [baseline, state, bp, month]);

  const current_row = roadmap.find((r) => r.month === selected_roadmap_month) ?? roadmap[0];
  const first = roadmap[0];
  const days = days_in_month(current_row?.month ?? month);

  const verdict = useMemo(() => {
    if (!baseline || !current_row || bp.monthlyNetTarget <= 0) return null;
    return build_plan_verdict({
      state,
      baseline,
      plan: bp,
      row: current_row,
      roadmap,
      days,
    });
  }, [baseline, current_row, roadmap, bp, state, days]);

  const drink_preview = useMemo(() => {
    if (!baseline || !current_row) return [];
    return drink_plan_preview(current_row.solve.cells, baseline.rows, days);
  }, [baseline, current_row, days]);

  const size_preview = useMemo(() => {
    if (!current_row) return [];
    return [...current_row.solve.cells]
      .filter((c) => c.qty > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [current_row]);

  function set_plan(patch: Partial<business_plan>) {
    set_state((prev) => patch_business_plan(prev, { ...patch, strategyId: 'custom' }));
  }

  function set_preset(id: Exclude<plan_strategy_id, 'custom'>) {
    set_state((prev) => apply_strategy_preset(prev, id));
  }

  function set_horizon(h: plan_horizon) {
    set_state((prev) => patch_business_plan(prev, { horizonMonths: h }));
  }

  function set_target(v: number) {
    set_state((prev) => patch_business_plan(prev, { monthlyNetTarget: Math.max(0, Math.round(v)) }));
  }

  function apply_current_month() {
    if (!current_row) return;
    set_state((prev) =>
      apply_month_cells_to_state(prev, current_row.month, current_row.solve.cells, {
        marketing: current_row.reinvest.marketing,
        equipment: current_row.reinvest.equipment,
      })
    );
    set_applied_msg(`qty по напиткам записаны в план на ${month_label(current_row.month)}`);
    setTimeout(() => set_applied_msg(''), 4000);
  }

  function apply_realistic() {
    if (!baseline || !verdict) return;
    // qty под объективную ёмкость, не под завышенную цель
    const realistic = solve_month({
      state,
      baseline,
      target_net: Math.max(0, verdict.can_net),
      mix_tilt_pct: bp.mixTiltPct,
      days,
    });
    const reinvest_pool = Math.max(0, realistic.net) * (bp.reinvestPct / 100);
    const split_sum =
      bp.reinvestSplit.marketing +
      bp.reinvestSplit.equipment +
      bp.reinvestSplit.stock +
      bp.reinvestSplit.reserve;
    const s = split_sum > 0 ? split_sum : 100;
    set_state((prev) =>
      apply_month_cells_to_state(prev, month, realistic.cells, {
        marketing: Math.round((reinvest_pool * bp.reinvestSplit.marketing) / s),
        equipment: Math.round((reinvest_pool * bp.reinvestSplit.equipment) / s),
      })
    );
    set_applied_msg(`записан реалистичный план под ёмкость ${format_rub(verdict.can_revenue)}`);
    setTimeout(() => set_applied_msg(''), 4000);
  }

  function apply_all() {
    if (!roadmap.length) return;
    set_state((prev) => apply_roadmap_to_state(prev, roadmap, { apply_reinvest: true }));
    set_applied_msg(`roadmap на ${roadmap.length} мес. записан`);
    setTimeout(() => set_applied_msg(''), 3500);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">как работает план</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-600">
          <li>ты задаёшь желаемую чистую прибыль точки в месяц</li>
          <li>
            система считает, какая выручка и сколько стаканов нужно — из твоих фиксов, налога и микса продаж
          </li>
          <li>
            сравнивает с объективной ёмкостью (прошлый месяц / экстраполяция текущего) и говорит: реально или нет
            — и почему
          </li>
          <li>раскладывает нужные продажи по напиткам; кнопкой записываешь qty в таблицу плана</li>
        </ol>
      </div>

      <Card
        title="хочу чистую в месяц"
        hint="прибыль точки; реинвест не обязателен — можно 0% и всё забирать себе"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="block min-w-[12rem] flex-1">
            <span className="mb-1 block text-xs text-neutral-500">цель чистой, ₽/мес</span>
            <NumInput value={bp.monthlyNetTarget} min={0} step={1000} on_change={set_target} />
          </label>
          <div>
            <p className="mb-1 text-xs text-neutral-500">горизонт</p>
            <div className="flex gap-1 rounded-pill border border-neutral-200/80 bg-white p-1">
              {([3, 6, 12] as plan_horizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => set_horizon(h)}
                  className={bp.horizonMonths === h ? chip_active : chip_idle}
                >
                  {h} мес.
                </button>
              ))}
            </div>
          </div>
        </div>
        {bp.monthlyNetTarget > 0 ? (
          <p className="mt-3 text-xs text-neutral-500">
            {bp.reinvestPct <= 0
              ? `реинвест 0% — все ${format_rub(bp.monthlyNetTarget)} себе`
              : `из чистой: себе ${format_rub(Math.round(bp.monthlyNetTarget * (1 - bp.reinvestPct / 100)))}, в развитие ${format_rub(Math.round(bp.monthlyNetTarget * (bp.reinvestPct / 100)))}`}
          </p>
        ) : null}
      </Card>

      <Card
        title="сколько стаканов реально могу"
        hint="для новой точки факт 5–10/день — не потолок. оценка после рекламы/узнаваемости"
      >
        {baseline && baseline.fact_cups_per_day > 0 && baseline.fact_cups_per_day < 12 && bp.assumedCupsPerDay <= 0 ? (
          <p className="mb-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            сейчас по факту ~{baseline.fact_cups_per_day.toFixed(0)} шт/день — точка только открылась, никто не
            знает. без твоей оценки план думает, что это потолок, и всё «недостижимо». поставь, сколько реально
            для города (часто 15–25).
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-36">
            <span className="mb-1 block text-xs text-neutral-500">шт / день</span>
            <NumInput
              value={bp.assumedCupsPerDay}
              min={0}
              step={1}
              on_change={(v) => set_plan({ assumedCupsPerDay: Math.max(0, Math.round(v)) })}
            />
          </label>
          <div className="flex flex-wrap gap-1 pb-0.5">
            {[0, 15, 20, 25, 30].map((n) => (
              <button
                key={n}
                type="button"
                className={bp.assumedCupsPerDay === n ? chip_active : chip_idle}
                onClick={() => set_plan({ assumedCupsPerDay: n })}
              >
                {n === 0 ? 'только факт' : `${n}`}
              </button>
            ))}
          </div>
        </div>
        {bp.assumedCupsPerDay > 0 && baseline ? (
          <p className="mt-2 text-xs text-neutral-500">
            ёмкость от оценки ≈ {format_rub(baseline.capacity_revenue)}
            {baseline.fact_capacity_revenue > 0
              ? ` · факт тянул бы только ${format_rub(baseline.fact_capacity_revenue)}`
              : ''}
          </p>
        ) : null}
      </Card>

      <Card title="стратегия" hint="реинвест — добровольно; пресет «себе» = 0% в развитие">
        <div className="mb-4 flex flex-wrap gap-1">
          {STRATEGY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set_preset(p.id)}
              className={bp.strategyId === p.id ? chip_active : chip_idle}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
          {bp.strategyId === 'custom' ? (
            <span className={`${chip_idle} pointer-events-none bg-neutral-100`}>своё</span>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>реинвест (можно 0%)</span>
              <span className="tabular-nums">{Math.round(bp.reinvestPct)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={bp.reinvestPct}
              onChange={(e) => set_plan({ reinvestPct: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent,#FF6B6B)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>рост трафика</span>
              <span className="tabular-nums">{bp.trafficGrowthPct}%/мес</span>
            </span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={bp.trafficGrowthPct}
              onChange={(e) => set_plan({ trafficGrowthPct: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent,#FF6B6B)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>рост чека</span>
              <span className="tabular-nums">{bp.ticketGrowthPct}%/мес</span>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={bp.ticketGrowthPct}
              onChange={(e) => set_plan({ ticketGrowthPct: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent,#FF6B6B)]"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>наклон к марже</span>
              <span className="tabular-nums">{bp.mixTiltPct}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={bp.mixTiltPct}
              onChange={(e) => set_plan({ mixTiltPct: Number(e.target.value) })}
              className="w-full accent-[var(--color-accent,#FF6B6B)]"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {(
            [
              ['marketing', 'маркетинг'],
              ['equipment', 'оборудование'],
              ['stock', 'склад'],
              ['reserve', 'резерв'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-neutral-500">{label}, %</span>
              <input
                type="number"
                min={0}
                max={100}
                className={field_class}
                value={bp.reinvestSplit[key]}
                onChange={(e) =>
                  set_plan({
                    reinvestSplit: {
                      ...bp.reinvestSplit,
                      [key]: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </Card>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading && !fact ? <p className="text-sm text-neutral-500">загружаю факт продаж…</p> : null}

      {bp.monthlyNetTarget <= 0 ? (
        <p className="rounded-2xl bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          укажи желаемую чистую — появится вердикт, план по напиткам и что улучшить
        </p>
      ) : null}

      {verdict && baseline && current_row ? (
        <div className={`rounded-3xl border p-4 shadow-soft sm:p-5 ${feasibility_bg(verdict.feasibility)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                вердикт на {bp.horizonMonths} мес.
              </p>
              <p className={`mt-1 font-heading-soft text-2xl ${feasibility_tone(verdict.feasibility)}`}>
                {verdict.first_ok_label
                  ? `достижимо с ${verdict.first_ok_label}`
                  : FEASIBILITY_LABEL[verdict.feasibility]}
              </p>
              {verdict.horizon_note ? (
                <p className="mt-1 text-sm text-neutral-600">{verdict.horizon_note}</p>
              ) : null}
              <p className="mt-2 max-w-2xl text-sm leading-snug text-neutral-700">{verdict.why}</p>
              <p className="mt-1 text-xs text-neutral-500">{CAPACITY_SOURCE_HINT[baseline.capacity_source]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn_primary} onClick={apply_current_month}>
                заполнить план по напиткам
              </button>
              {verdict.this_month_feasibility === 'unreachable' ||
              verdict.this_month_feasibility === 'stretch' ? (
                <button type="button" className={btn_secondary} onClick={apply_realistic}>
                  заполнить как реально могу сейчас
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <p className="text-xs text-neutral-500">чтобы цель — нужно</p>
              <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900">
                {format_rub(verdict.need_revenue)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                ~{verdict.need_cups_day.toFixed(0)} шт/день · чистая {format_rub(verdict.need_net)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <p className="text-xs text-neutral-500">
                сейчас ({FEASIBILITY_LABEL[verdict.this_month_feasibility]})
              </p>
              <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900">
                {format_rub(verdict.can_revenue)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                ~{verdict.can_cups_day.toFixed(0)} шт/день · чистая ~{format_rub(verdict.can_net)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <p className="text-xs text-neutral-500">прогноз к концу горизонта</p>
              <p className="mt-1 font-heading-soft text-xl tabular-nums text-neutral-900">
                {format_rub(verdict.end_capacity_revenue)}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {verdict.first_ok_label
                  ? `цель по статусу с ${verdict.first_ok_label}`
                  : 'при заданном % роста'}
              </p>
            </div>
          </div>

          {verdict.this_month_feasibility === 'unreachable' || verdict.gap_revenue > 0 ? (
            <p className="mt-3 text-sm text-neutral-700">
              сейчас разрыв {format_rub(verdict.gap_revenue)}
              {verdict.months_to_reach != null && verdict.months_to_reach > 0
                ? ` · по roadmap цель в зоне «реально» через ~${verdict.months_to_reach} мес.`
                : verdict.feasibility === 'unreachable'
                  ? ' · за весь горизонт при текущем % роста не догоняете'
                  : ''}
            </p>
          ) : null}

          {applied_msg ? <p className="mt-3 text-xs text-emerald-700">{applied_msg}</p> : null}
        </div>
      ) : null}

      {verdict && verdict.levers.length > 0 ? (
        <Card title="что поможет дотянуть" hint="условия, при которых «недостижимо» становится реально">
          <ul className="space-y-3">
            {verdict.levers.map((lever) => (
              <li key={lever.id} className="rounded-2xl border border-neutral-100 bg-neutral-50/80 px-3 py-2.5">
                <p className="text-sm font-medium text-neutral-900">{lever.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-neutral-500">{lever.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {first && baseline && bp.monthlyNetTarget > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="фикс. расходы"
            value={format_rub(baseline.fixed_total)}
            hint="opex + ФОТ-налоги + амортизация"
          />
          <StatCard
            label="маржа плана"
            value={`${(baseline.gross_margin_pct * 100).toFixed(0)}%`}
            hint={
              baseline.margin_capped
                ? `рецепт ${(baseline.recipe_margin_pct * 100).toFixed(0)}% → потолок`
                : 'после себеса по техкартам'
            }
          />
          <StatCard
            label="безубыточность (план)"
            value={format_rub(baseline.break_even)}
            hint="с маржей плана; на дашборде может быть ниже"
          />
          <StatCard
            label="себе / реинвест"
            value={format_rub(current_row?.owner_take ?? 0)}
            hint={`в развитие ${format_rub(current_row?.reinvest_total ?? 0)}`}
            tone="good"
          />
        </div>
      ) : null}

      {baseline?.margin_capped ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          техкарты дают слишком высокую маржу — для плана стоит потолок. проверь себестоимость, иначе цифры
          будут оптимистичными.
        </p>
      ) : null}
      {baseline && baseline.fixed_total <= 0 ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          постоянные расходы = 0. задай аренду/ФОТ в «деньги» на дашборде.
        </p>
      ) : null}

      {drink_preview.length > 0 && bp.monthlyNetTarget > 0 ? (
        <Card
          title="предложение по напиткам"
          hint={`qty на ${month_label(current_row?.month ?? month)} из цели · ещё не в плане, пока не нажмёшь «заполнить»`}
          actions={
            <button type="button" className={btn_primary} onClick={apply_current_month}>
              записать в план
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-neutral-400">
                  <th className="pb-2 text-left font-medium">напиток</th>
                  <th className="pb-2 text-right font-medium">план, шт</th>
                  <th className="pb-2 text-right font-medium">шт/день</th>
                  <th className="pb-2 text-right font-medium">выручка</th>
                  <th className="pb-2 text-right font-medium">факт базы</th>
                  <th className="pb-2 text-right font-medium">маржа</th>
                </tr>
              </thead>
              <tbody>
                {drink_preview.map((d) => (
                  <tr key={d.tech_card_id} className="border-t border-neutral-100">
                    <td className="py-2 pr-3 font-medium text-neutral-900">{d.name}</td>
                    <td className="py-2 text-right tabular-nums">{d.qty}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-600">{d.qty_day.toFixed(1)}</td>
                    <td className="py-2 text-right tabular-nums">{format_rub(d.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-500">{d.fact_qty || '—'}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-600">
                      {(d.margin_pct * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {size_preview.length > 0 ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-neutral-500">разбивка по размерам</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="text-neutral-400">
                      <th className="pb-1 text-left font-medium">позиция</th>
                      <th className="pb-1 text-right font-medium">размер</th>
                      <th className="pb-1 text-right font-medium">шт</th>
                      <th className="pb-1 text-right font-medium">цена</th>
                      <th className="pb-1 text-right font-medium">сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {size_preview.map((c) => {
                      const name =
                        baseline?.rows.find(
                          (r) => r.tech_card_id === c.tech_card_id && r.size_key === c.size_key
                        )?.name ?? c.tech_card_id;
                      return (
                        <tr key={`${c.tech_card_id}-${c.size_key}`} className="border-t border-neutral-100">
                          <td className="py-1.5 pr-2">{name}</td>
                          <td className="py-1.5 text-right">{size_label(c.size_key)}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.qty}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.price}</td>
                          <td className="py-1.5 text-right tabular-nums">{format_rub(c.revenue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </Card>
      ) : null}

      {roadmap.length > 0 && bp.monthlyNetTarget > 0 ? (
        <Card
          title="roadmap"
          hint={`${bp.horizonMonths} мес. · «прогноз» = старт × рост ${bp.trafficGrowthPct}%/+${bp.ticketGrowthPct}% чека, потолок ×${2.2} — не обещание ляма`}
          actions={
            <button type="button" className={btn_secondary} onClick={apply_all}>
              применить весь roadmap
            </button>
          }
        >
          <p className="mb-3 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">нужно</span> — выручка под твою цель чистой.{' '}
            <span className="font-medium text-neutral-700">прогноз</span> — если каждый месяц реально
            держишь заданный % роста от текущей ёмкости (оценка стаканов / факт). это сценарий, не факт, что
            сделаешь миллион.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-neutral-400">
                  <th className="pb-2 text-left font-medium">месяц</th>
                  <th className="pb-2 text-right font-medium">нужно ₽</th>
                  <th className="pb-2 text-right font-medium">прогноз ₽</th>
                  <th className="pb-2 text-right font-medium">нужно шт/д</th>
                  <th className="pb-2 text-right font-medium">прогноз шт/д</th>
                  <th className="pb-2 text-right font-medium">себе</th>
                  <th className="pb-2 text-right font-medium">статус</th>
                </tr>
              </thead>
              <tbody>
                {roadmap.map((row) => {
                  const active = row.month === (current_row?.month ?? '');
                  return (
                    <tr
                      key={row.month}
                      className={`cursor-pointer border-t border-neutral-100 transition-colors ${
                        active ? 'bg-accent/5' : 'hover:bg-neutral-50'
                      }`}
                      onClick={() => set_selected_roadmap_month(row.month)}
                    >
                      <td className="py-2.5 pr-3 font-medium text-neutral-900">{month_label(row.month)}</td>
                      <td className="py-2.5 text-right tabular-nums">{format_rub(row.solve.revenue)}</td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-500">
                        {format_rub(row.capacity_revenue)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{row.solve.cups_per_day.toFixed(0)}</td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-500">
                        {row.capacity_cups_day.toFixed(0)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-emerald-700">
                        {format_rub(row.owner_take)}
                      </td>
                      <td className={`py-2.5 text-right text-xs font-medium ${feasibility_tone(row.feasibility)}`}>
                        {FEASIBILITY_LABEL[row.feasibility]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="space-y-3 border-t border-neutral-200/80 pt-5">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">редактор плана vs факт</h2>
          <p className="text-sm text-neutral-500">
            правка руками; автоqty — после «заполнить план по напиткам»
          </p>
        </div>
        <SalesSection {...props} />
      </div>
    </div>
  );
}
