'use client';

import { useEffect, useState } from 'react';
import {
  amortization_per_month,
  apply_opex_to_all_months,
  format_rub,
  insurance_from_net,
  is_salary_opex,
  ndfl_from_net,
  new_id,
  summarize_month,
  tax_regime_of,
  type tax_regime,
  update_month,
  with_fact_revenue,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { BreakEvenCard, Card, NumInput, cell_input_class, field_class } from '@/components/admin/finance/ui';

const tax_choices: { id: tax_regime; label: string; rate: number }[] = [
  { id: 'ausn_income', label: 'аусн с продаж', rate: 8 },
  { id: 'ausn_profit', label: 'аусн с прибыли', rate: 20 },
  { id: 'usn_income', label: 'усн с продаж', rate: 6 },
  { id: 'usn_profit', label: 'усн с прибыли', rate: 15 },
  { id: 'patent', label: 'патент', rate: 0 },
  { id: 'custom', label: 'своя ставка', rate: 8 },
];

function salary_id_of(state: section_props['state']) {
  return state.opexCategories.find((c) => is_salary_opex(c.id))?.id ?? 'salary';
}

function years_of(months: number) {
  return Math.round((Math.max(1, months) / 12) * 10) / 10;
}

export default function ModelSection({ state, set_state, month }: section_props) {
  const [new_cost, set_new_cost] = useState('');
  const [gear_open, set_gear_open] = useState(false);
  const [fact_rev, set_fact_rev] = useState(0);
  const md = state.monthsData.find((m) => m.month === month);
  const regime = tax_regime_of(state);
  const salary_id = salary_id_of(state);
  const salary = md ? Number(md.opex[salary_id]) || 0 : 0;
  const ndfl = ndfl_from_net(salary, state.ndflRate);
  const insurance = insurance_from_net(salary, state.insuranceRate);
  const rest = state.opexCategories.filter((c) => !is_salary_opex(c.id));
  const amort = amortization_per_month(state);
  const break_even = md ? with_fact_revenue(summarize_month(state, md), fact_rev, state).break_even : 0;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/finance/sales?month=${month}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { revenue?: number }) => {
        if (!cancelled && body.revenue) set_fact_rev(body.revenue);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    if (state.opexCategories.some((c) => is_salary_opex(c.id))) return;
    set_state((prev) => {
      if (prev.opexCategories.some((c) => is_salary_opex(c.id))) return prev;
      return { ...prev, opexCategories: [...prev.opexCategories, { id: 'salary', name: 'зарплаты' }] };
    });
  }, [set_state, state.opexCategories]);

  function set_regime(id: tax_regime) {
    const next = tax_choices.find((r) => r.id === id);
    if (!next) return;
    set_state((prev) => ({
      ...prev,
      taxRegime: id,
      taxRate: id === 'custom' ? prev.taxRate : next.rate,
      insuranceRate: id.startsWith('ausn') ? 0 : prev.insuranceRate,
    }));
  }

  function set_opex(id: string, v: number) {
    set_state((prev) => update_month(prev, month, (m) => ({ ...m, opex: { ...m.opex, [id]: v } })));
  }

  function set_salary(v: number) {
    set_state((prev) => {
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

  function remove_cost(id: string, name: string) {
    if (!window.confirm(`убрать «${name}»?`)) return;
    set_state((prev) => ({
      ...prev,
      opexCategories: prev.opexCategories.filter((x) => x.id !== id),
      monthsData: prev.monthsData.map((m) => {
        const opex = { ...m.opex };
        delete opex[id];
        return { ...m, opex };
      }),
    }));
  }

  if (!md) {
    return (
      <p className="rounded-3xl border border-dashed border-accent/25 bg-accent/5 px-4 py-8 text-center text-sm text-neutral-500">
        добавьте месяц сверху — и сюда можно вписать расходы
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <BreakEvenCard value={break_even} />

      <Card title="система налогообложения">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem]">
          <label className="text-xs text-neutral-500">
            режим
            <select
              className={`${field_class} mt-1`}
              value={state.taxRegime}
              onChange={(e) => set_regime(e.target.value as tax_regime)}
            >
              {tax_choices.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {regime.kind === 'patent' ? (
            <Money label="патент в месяц, ₽">
              <NumInput
                value={state.taxPatentMonthly}
                min={0}
                on_change={(v) => set_state((p) => ({ ...p, taxPatentMonthly: Math.max(0, v) }))}
              />
            </Money>
          ) : (
            <Money label={regime.kind === 'profit' ? '% с прибыли' : '% с продаж'}>
              <NumInput value={state.taxRate} min={0} on_change={(v) => set_state((p) => ({ ...p, taxRate: Math.max(0, v) }))} />
            </Money>
          )}
          <Money label="% налога с зарплат">
            <NumInput
              value={state.ndflRate}
              min={0}
              on_change={(v) => set_state((p) => ({ ...p, ndflRate: Math.min(99, Math.max(0, v)) }))}
            />
          </Money>
          <Money label="% взносов">
            <NumInput
              value={state.insuranceRate}
              min={0}
              on_change={(v) => set_state((p) => ({ ...p, insuranceRate: Math.max(0, v) }))}
            />
          </Money>
        </div>
      </Card>

      <Card
        title="постоянные расходы"
        hint="зарплаты, аренда, свет — то, что уходит независимо от продаж"
        actions={
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() => set_state((prev) => apply_opex_to_all_months(prev, md.opex))}
          >
            и в других месяцах так же
          </button>
        }
      >
        <Line name="зарплаты на руки" name_locked value={salary} on_value={set_salary} />
        {salary > 0 && (ndfl > 0 || insurance > 0) ? (
          <p className="mb-2 pl-1 text-xs text-neutral-400">
            сверху {format_rub(ndfl)} налога
            {insurance > 0 ? ` и ${format_rub(insurance)} взносов` : ''}
          </p>
        ) : null}
        {rest.map((c) => (
          <Line
            key={c.id}
            name={c.name}
            value={md.opex[c.id] ?? 0}
            on_name={(name) =>
              set_state((prev) => ({
                ...prev,
                opexCategories: prev.opexCategories.map((x) => (x.id === c.id ? { ...x, name } : x)),
              }))
            }
            on_value={(v) => set_opex(c.id, v)}
            on_remove={() => remove_cost(c.id, c.name)}
          />
        ))}
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add_cost();
          }}
        >
          <input
            className={`${field_class} min-w-0 flex-1`}
            placeholder="ещё расход"
            value={new_cost}
            onChange={(e) => set_new_cost(e.target.value)}
          />
          <button
            type="submit"
            disabled={!new_cost.trim()}
            className="shrink-0 rounded-pill border border-neutral-200 px-4 py-2 text-sm text-neutral-700 disabled:opacity-40"
          >
            добавить
          </button>
        </form>
      </Card>

      <Card
        title="техника"
        actions={
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              set_state((prev) => ({
                ...prev,
                equipments: [...prev.equipments, { id: new_id('eq'), name: 'новая техника', price: 0, months: 24 }],
              }))
            }
          >
            + техника
          </button>
        }
      >
        <button
          type="button"
          onClick={() => set_gear_open((v) => !v)}
          className="mb-3 flex w-full items-center justify-between rounded-2xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600"
        >
          <span>
            {state.equipments.length ? `${state.equipments.length} позиций · ${format_rub(amort)} в месяц` : 'пока пусто'}
          </span>
          <span className="text-neutral-400">{gear_open ? 'свернуть' : 'список'}</span>
        </button>
        {gear_open
          ? state.equipments.map((e) => (
              <div key={e.id} className="mb-2 grid grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_auto] items-center gap-2">
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
      </Card>
    </div>
  );
}

function Line({
  name,
  value,
  name_locked,
  on_name,
  on_value,
  on_remove,
}: {
  name: string;
  value: number;
  name_locked?: boolean;
  on_name?: (v: string) => void;
  on_value: (v: number) => void;
  on_remove?: () => void;
}) {
  return (
    <div className="mb-2 grid grid-cols-[minmax(8rem,1fr)_8rem_1.75rem] items-center gap-2">
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
    </div>
  );
}

function Money({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-neutral-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
