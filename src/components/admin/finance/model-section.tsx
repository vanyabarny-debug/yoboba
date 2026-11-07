'use client';

import { useEffect, useState } from 'react';
import {
  amortization_per_month,
  apply_opex_to_all_months,
  apply_tax_regime,
  CUSTOM_TAX_BASIS,
  custom_taxes_of,
  default_custom_taxes,
  effective_month_opex,
  equipment_active,
  format_rub,
  is_salary_opex,
  new_id,
  OPEX_TEMPLATE,
  other_opex_sum,
  resolve_month_opex,
  resolve_month_payroll,
  set_month_payroll,
  TAX_REGIMES,
  tax_regime_of,
  type custom_tax_basis,
  type custom_tax_line,
  type tax_regime,
  update_month,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { Card, MenuSelect, NumInput, cell_input_class, field_class } from '@/components/admin/finance/ui';

function years_of(months: number) {
  return Math.round((Math.max(1, months) / 12) * 10) / 10;
}

/** редактор модели: налоги, постоянные, техника — встраивается в плашку пост. расходов */
export default function ModelSection({
  state,
  set_state,
  month,
  embedded = false,
}: section_props & { embedded?: boolean }) {
  const [new_cost, set_new_cost] = useState('');
  const [gear_open, set_gear_open] = useState(false);
  const md = state.monthsData.find((m) => m.month === month);
  const regime = tax_regime_of(state);
  const opex = md ? resolve_month_opex(state, month) : {};
  const pay = md ? resolve_month_payroll(state, { ...md, opex }) : null;
  const salary = pay?.net ?? 0;
  const ndfl = pay?.ndfl ?? 0;
  const insurance = pay?.insurance ?? 0;
  const rest = state.opexCategories.filter((c) => !is_salary_opex(c.id));
  const opex_inherited = md ? other_opex_sum(md.opex) <= 0 && other_opex_sum(opex) > 0 : false;
  const amort = amortization_per_month(state, month);
  const effective = md ? effective_month_opex(state, month) : { rows: [], total: 0 };
  const fact_by_id = new Map(effective.rows.map((r) => [r.id, r]));
  const plan_total = effective.rows.reduce((s, r) => s + r.plan, 0);
  const missing_template = OPEX_TEMPLATE.filter(
    (t) =>
      !state.opexCategories.some(
        (c) => c.id === t.id || c.name.trim().toLowerCase() === t.name.trim().toLowerCase()
      ) && !(t.id === 'ip_insurance' && regime.id.startsWith('ausn'))
  );

  useEffect(() => {
    if (state.opexCategories.some((c) => is_salary_opex(c.id))) return;
    set_state((prev) => {
      if (prev.opexCategories.some((c) => is_salary_opex(c.id))) return prev;
      return { ...prev, opexCategories: [...prev.opexCategories, { id: 'salary', name: 'зарплаты' }] };
    });
  }, [set_state, state.opexCategories]);

  function set_regime(id: tax_regime) {
    set_state((prev) => apply_tax_regime(prev, id));
  }

  function set_opex(id: string, v: number) {
    set_state((prev) => {
      const resolved = resolve_month_opex(prev, month);
      let next = update_month(prev, month, (m) => ({
        ...m,
        opex: { ...resolved, ...m.opex, [id]: v },
      }));
      if (!is_salary_opex(id)) {
        next = apply_opex_to_all_months(next, { ...resolve_month_opex(next, month), [id]: v });
      }
      return next;
    });
  }

  function set_salary(v: number) {
    set_state((prev) => {
      const md0 = prev.monthsData.find((m) => m.month === month);
      const prev_lines = md0 ? resolve_month_payroll(prev, md0).lines : [];
      const with_ndfl = prev_lines.length ? prev_lines.some((l) => l.withNdfl) : true;
      if (prev_lines.length <= 1) {
        return set_month_payroll(prev, month, [
          { id: prev_lines[0]?.id || new_id('pay'), name: prev_lines[0]?.name || 'ФОТ', amount: v, withNdfl: with_ndfl },
        ]);
      }
      const id = prev.opexCategories.find((c) => is_salary_opex(c.id))?.id ?? 'salary';
      const cats = prev.opexCategories.some((c) => c.id === id)
        ? prev.opexCategories
        : [...prev.opexCategories, { id, name: 'зарплаты' }];
      return update_month({ ...prev, opexCategories: cats }, month, (m) => ({ ...m, opex: { ...m.opex, [id]: v } }));
    });
  }

  function add_cost() {
    const name = new_cost.trim();
    if (!name) return;
    const id = /зарплат|фот|salary/i.test(name) ? new_id('salary') : new_id('opex');
    set_state((prev) => ({ ...prev, opexCategories: [...prev.opexCategories, { id, name }] }));
    set_new_cost('');
  }

  function add_template(ids: string[]) {
    set_state((prev) => {
      const rows = OPEX_TEMPLATE.filter((t) => ids.includes(t.id) && !prev.opexCategories.some((c) => c.id === t.id));
      if (!rows.length) return prev;
      return { ...prev, opexCategories: [...prev.opexCategories, ...rows.map((t) => ({ id: t.id, name: t.name }))] };
    });
  }

  function remove_cost(id: string, name: string) {
    if (!window.confirm(`убрать «${name}»?`)) return;
    set_state((prev) => ({
      ...prev,
      opexCategories: prev.opexCategories.filter((x) => x.id !== id),
      monthsData: prev.monthsData.map((m) => {
        const next_opex = { ...m.opex };
        delete next_opex[id];
        return { ...m, opex: next_opex };
      }),
    }));
  }

  if (!md) {
    return (
      <p className="py-2 text-sm text-neutral-400">
        нет месяца в модели — выберите период сверху
      </p>
    );
  }

  function patch_custom_taxes(next: custom_tax_line[]) {
    set_state((p) => ({ ...p, customTaxes: next }));
  }

  const custom_lines = custom_taxes_of(state);
  const injury_show = regime.show_injury
    ? Math.max(0, Math.round(Number(state.injuryMonthly ?? regime.injury_monthly) || 0))
    : 0;
  const regime_summary = (() => {
    if (regime.id === 'custom') return null;
    const parts: string[] = [];
    if (regime.kind !== 'patent') {
      parts.push(
        `налог ${regime.rate}% ${regime.kind === 'profit' ? 'с прибыли' : 'с доходов'}`
      );
    }
    if (regime.show_injury && injury_show > 0) {
      parts.push(`травматизм ${format_rub(injury_show)}/мес`);
    }
    if (regime.show_insurance) {
      parts.push(`страховые ${regime.insurance_rate}% с ФОТ`);
    }
    if (regime.show_ndfl) {
      parts.push(`ндфл ${state.ndflRate || 13}% с ФОТ`);
    }
    return parts.join(' · ');
  })();

  const tax_block = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="w-full max-w-[16rem] shrink-0 sm:w-auto">
          <MenuSelect
            value={state.taxRegime}
            options={TAX_REGIMES.map((r) => ({ id: r.id, label: r.label, hint: r.hint }))}
            on_change={(id) => set_regime(id as tax_regime)}
            menu_className="w-full min-w-[16rem]"
          />
        </div>
        {regime.kind === 'patent' ? (
          <label className="flex items-center gap-1.5 text-[12px] text-neutral-600">
            патент
            <NumInput
              value={state.taxPatentMonthly}
              min={0}
              className={`${cell_input_class} w-24`}
              on_change={(v) => set_state((p) => ({ ...p, taxPatentMonthly: Math.max(0, v) }))}
            />
            <span className="text-neutral-400">₽/мес</span>
          </label>
        ) : null}
        {regime_summary ? (
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-neutral-600">{regime_summary}</p>
        ) : null}
      </div>

      {regime.id === 'custom' ? (
        <div className="space-y-2">
          <p className="text-[11px] text-neutral-400">
            свои налоги и взносы — название, база и ставка. для расчёта в другой стране.
          </p>
          <div className="space-y-2">
            {custom_lines.map((line, i) => (
              <div
                key={line.id}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5.5rem_1.5rem] items-end gap-2"
              >
                <label className="text-[10px] text-neutral-400">
                  название
                  <input
                    className={`${field_class} mt-1`}
                    value={line.name}
                    placeholder="VAT / social tax…"
                    onChange={(e) => {
                      patch_custom_taxes(
                        custom_lines.map((t, j) => (j === i ? { ...t, name: e.target.value } : t))
                      );
                    }}
                  />
                </label>
                <label className="text-[10px] text-neutral-400">
                  база
                  <div className="mt-1">
                    <MenuSelect
                      value={line.basis}
                      options={CUSTOM_TAX_BASIS.map((b) => ({ id: b.id, label: b.label }))}
                      on_change={(id) => {
                        patch_custom_taxes(
                          custom_lines.map((t, j) =>
                            j === i ? { ...t, basis: id as custom_tax_basis } : t
                          )
                        );
                      }}
                      menu_className="w-full min-w-[12rem]"
                    />
                  </div>
                </label>
                <label className="text-[10px] text-neutral-400">
                  {line.basis === 'fixed' ? '₽/мес' : '%'}
                  <div className="mt-1">
                    <NumInput
                      value={line.value}
                      min={0}
                      on_change={(v) => {
                        patch_custom_taxes(
                          custom_lines.map((t, j) =>
                            j === i ? { ...t, value: Math.max(0, v) } : t
                          )
                        );
                      }}
                    />
                  </div>
                </label>
                <button
                  type="button"
                  className="mb-2 justify-self-center text-lg leading-none text-neutral-300 hover:text-red-500"
                  aria-label="удалить"
                  onClick={() => patch_custom_taxes(custom_lines.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => {
              if (!custom_lines.length) {
                patch_custom_taxes(default_custom_taxes());
                return;
              }
              patch_custom_taxes([
                ...custom_lines,
                { id: new_id('ctx'), name: '', basis: 'revenue', value: 0 },
              ]);
            }}
          >
            + налог / взнос
          </button>
        </div>
      ) : null}
    </div>
  );

  const opex_block = (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-neutral-400">
          аренда, свет и т.п. · одни на все месяцы · фот — в плашке фот
        </p>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={() => set_state((prev) => apply_opex_to_all_months(prev, resolve_month_opex(prev, month)))}
        >
          проставить во все месяцы
        </button>
      </div>
      {!embedded ? (
        <>
          <Line name="фот на руки" name_locked value={salary} on_value={set_salary} />
          {salary > 0 ? (
            <p className="mb-2 pl-1 text-xs text-neutral-400">
              разбивка по людям — в плашке фот
              {ndfl > 0 ? ` · ндфл ${format_rub(ndfl)}` : ''}
              {insurance > 0 ? ` · взносы ${format_rub(insurance)}` : ''}
            </p>
          ) : null}
        </>
      ) : null}
      {opex_inherited ? (
        <p className="mb-2 pl-1 text-xs text-amber-700/80">
          ниже подставлены из другого месяца — правка сразу во все месяцы
        </p>
      ) : null}
      {rest.map((c) => {
        const row = fact_by_id.get(c.id);
        const hint = OPEX_TEMPLATE.find((t) => t.id === c.id)?.hint;
        return (
          <Line
            key={c.id}
            name={c.name}
            value={opex[c.id] ?? 0}
            note={
              row?.from_fact
                ? `оплачено в операциях ${format_rub(row.fact)} — в прибыль идёт факт${
                    row.plan > 0 && row.plan !== row.fact ? `, план ${format_rub(row.plan)}` : ''
                  }`
                : hint || undefined
            }
            note_tone={row?.from_fact ? 'fact' : 'hint'}
            on_name={(name) =>
              set_state((prev) => ({
                ...prev,
                opexCategories: prev.opexCategories.map((x) => (x.id === c.id ? { ...x, name } : x)),
              }))
            }
            on_value={(v) => set_opex(c.id, v)}
            on_remove={() => remove_cost(c.id, c.name)}
          />
        );
      })}
      <div className="mb-3 mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-neutral-100 pt-2 text-sm">
        <span className="font-medium text-neutral-800">итого в месяц</span>
        <span className="tabular-nums font-semibold text-neutral-900">
          {format_rub(effective.total)}
          {Math.round(plan_total) !== Math.round(effective.total) ? (
            <span className="ml-1.5 text-[11px] font-normal text-neutral-400">план {format_rub(plan_total)}</span>
          ) : null}
        </span>
      </div>
      <label className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-neutral-600">
        эквайринг
        <NumInput
          value={state.acquiringRate ?? 0}
          min={0}
          step={0.1}
          className={`${cell_input_class} w-20`}
          on_change={(v) => set_state((p) => ({ ...p, acquiringRate: Math.min(10, Math.max(0, v)) }))}
        />
        <span className="text-neutral-400">% с безнала · переменный, считается от оплат картой</span>
      </label>
      {missing_template.length ? (
        <div className="mb-3 space-y-1.5 rounded-2xl bg-neutral-50 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-neutral-500">
              типовые статьи, которых нет в списке. непредвиденное сюда не добавляйте — разовые траты идут
              расходом в операциях
            </p>
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => add_template(missing_template.map((t) => t.id))}
            >
              добавить все
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missing_template.map((t) => (
              <button
                key={t.id}
                type="button"
                title={[t.group, t.hint].filter(Boolean).join(' · ')}
                onClick={() => add_template([t.id])}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] text-neutral-700 ring-1 ring-neutral-200 hover:ring-neutral-400"
              >
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add_cost();
        }}
      >
        <input
          className={`${field_class} min-w-0 flex-1 py-1.5`}
          placeholder="ещё расход"
          value={new_cost}
          onChange={(e) => set_new_cost(e.target.value)}
        />
        <button
          type="submit"
          disabled={!new_cost.trim()}
          className="shrink-0 rounded-pill border border-neutral-200 px-4 py-1.5 text-sm text-neutral-700 disabled:opacity-40"
        >
          добавить
        </button>
      </form>
    </div>
  );

  const gear_block = (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => set_gear_open((v) => !v)}
          className="text-sm text-neutral-600"
        >
          {state.equipments.length
            ? `${state.equipments.length} позиций · ${format_rub(amort)}/мес`
            : 'техники пока нет'}
          <span className="ml-2 text-neutral-400">{gear_open ? 'свернуть' : 'список'}</span>
        </button>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={() =>
            set_state((prev) => ({
              ...prev,
              equipments: [
                ...prev.equipments,
                { id: new_id('eq'), name: 'новая техника', price: 0, months: 24, from: month },
              ],
            }))
          }
        >
          + техника
        </button>
      </div>
      {gear_open ? (
        <p className="mb-2 text-[11px] leading-snug text-neutral-400">
          цена · срок в годах · месяц покупки. амортизация = цена / срок, идёт с месяца покупки до конца срока.
          покупка через операции («оборудование») добавляется сюда сама
        </p>
      ) : null}
      {gear_open
        ? state.equipments.map((e) => (
            <div key={e.id} className="mb-2 grid grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_7.5rem_auto] items-center gap-2">
              <input
                className={field_class}
                value={e.name}
                onChange={(ev) =>
                  set_state((prev) => ({
                    ...prev,
                    equipments: prev.equipments.map((x) => (x.id === e.id ? { ...x, name: ev.target.value } : x)),
                  }))
                }
              />
              <NumInput
                value={e.price}
                min={0}
                on_change={(v) =>
                  set_state((prev) => ({
                    ...prev,
                    equipments: prev.equipments.map((x) => (x.id === e.id ? { ...x, price: v } : x)),
                  }))
                }
              />
              <NumInput
                value={years_of(e.months)}
                min={0.5}
                step={0.5}
                on_change={(v) =>
                  set_state((prev) => ({
                    ...prev,
                    equipments: prev.equipments.map((x) =>
                      x.id === e.id ? { ...x, months: Math.max(1, Math.round(v * 12)) } : x
                    ),
                  }))
                }
              />
              <label className="block">
                <span className="sr-only">месяц покупки</span>
                <input
                  type="month"
                  value={e.from || ''}
                  title={equipment_active(e, month) ? 'амортизируется в этом месяце' : 'в этом месяце не амортизируется'}
                  onChange={(ev) =>
                    set_state((prev) => ({
                      ...prev,
                      equipments: prev.equipments.map((x) =>
                        x.id === e.id
                          ? { ...x, from: /^\d{4}-\d{2}$/.test(ev.target.value) ? ev.target.value : undefined }
                          : x
                      ),
                    }))
                  }
                  className={`${field_class} px-2 ${equipment_active(e, month) ? '' : 'text-neutral-400'}`}
                />
              </label>
              <button
                type="button"
                className="px-1 text-lg leading-none text-neutral-300 hover:text-red-500"
                aria-label={`удалить ${e.name}`}
                onClick={() => set_state((prev) => ({ ...prev, equipments: prev.equipments.filter((x) => x.id !== e.id) }))}
              >
                ×
              </button>
            </div>
          ))
        : null}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-5" onClick={(e) => e.stopPropagation()}>
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">налоги</p>
          {tax_block}
        </section>
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">
            постоянные расходы
          </p>
          {opex_block}
        </section>
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-400">техника</p>
          {gear_block}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="система налогообложения">{tax_block}</Card>
      <Card title="постоянные расходы">{opex_block}</Card>
      <Card title="техника">{gear_block}</Card>
    </div>
  );
}

function Line({
  name,
  value,
  name_locked,
  note,
  note_tone = 'hint',
  on_name,
  on_value,
  on_remove,
}: {
  name: string;
  value: number;
  name_locked?: boolean;
  note?: string;
  note_tone?: 'hint' | 'fact';
  on_name?: (v: string) => void;
  on_value: (v: number) => void;
  on_remove?: () => void;
}) {
  return (
    <div className="mb-2 grid grid-cols-[minmax(8rem,1fr)_8rem_1.75rem] items-center gap-x-2 gap-y-0.5">
      {name_locked ? (
        <p className="truncate px-3 text-sm text-neutral-700">{name}</p>
      ) : (
        <input className={field_class} value={name} onChange={(e) => on_name?.(e.target.value)} />
      )}
      <NumInput value={value} min={0} className={`${cell_input_class} rounded-2xl py-2`} on_change={on_value} />
      {on_remove ? (
        <button
          type="button"
          className="justify-self-center px-1 text-lg leading-none text-neutral-300 hover:text-red-500"
          aria-label={`удалить ${name}`}
          onClick={on_remove}
        >
          ×
        </button>
      ) : (
        <span />
      )}
      {note ? (
        <p
          className={`col-span-3 pl-3 text-[11px] leading-snug ${
            note_tone === 'fact' ? 'text-emerald-700' : 'text-neutral-400'
          }`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
