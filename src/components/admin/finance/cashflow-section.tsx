'use client';

import { useMemo } from 'react';
import { cashflow_table, format_rub, month_label, tax_label, update_month } from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { Card, EmptyState, NumInput, StatCard, TableWrap, td_class, td_num_class, th_class, th_num_class } from '@/components/admin/finance/ui';

export default function CashflowSection({ state, set_state, month, set_month, compact }: section_props) {
  const rows = useMemo(() => cashflow_table(state), [state]);
  const current = rows.find((r) => r.month === month);
  const md = state.monthsData.find((m) => m.month === month);
  const last = rows[rows.length - 1];

  if (!md || !current) return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;

  const invest_inputs = (
    <div className="grid gap-3">
      <label className="text-xs text-neutral-500">
        вложения владельца / инвестиции, ₽
        <NumInput
          value={md.cashFlow?.inflowInvestments ?? 0}
          min={0}
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-right text-sm"
          on_change={(v) => set_state((prev) => update_month(prev, month, (m) => ({ ...m, cashFlow: { inflowInvestments: v, outflowCapex: m.cashFlow?.outflowCapex ?? 0 } })))}
        />
      </label>
      <label className="text-xs text-neutral-500">
        покупка оборудования (capex), ₽
        <NumInput
          value={md.cashFlow?.outflowCapex ?? 0}
          min={0}
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-right text-sm"
          on_change={(v) => set_state((prev) => update_month(prev, month, (m) => ({ ...m, cashFlow: { inflowInvestments: m.cashFlow?.inflowInvestments ?? 0, outflowCapex: v } })))}
        />
      </label>
    </div>
  );

  if (compact) return invest_inputs;

  const line = (label: string, value: number, opts?: { bold?: boolean; sign?: '+' | '−'; muted?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 text-sm ${opts?.bold ? 'font-semibold text-neutral-900' : opts?.muted ? 'text-neutral-400' : 'text-neutral-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        {opts?.sign ? `${opts.sign} ` : ''}
        {format_rub(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`на начало · ${month_label(month)}`} value={format_rub(current.opening)} />
        <StatCard label="поступления" value={format_rub(current.inflow)} tone="good" />
        <StatCard label="выплаты" value={format_rub(current.outflow)} tone="bad" />
        <StatCard label="на конец месяца" value={format_rub(current.closing)} tone={current.closing >= 0 ? 'default' : 'bad'} hint={last ? `сейчас всего: ${format_rub(last.closing)}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`движение денег · ${month_label(month)}`} hint="закупки сырья — по факту операций, если они введены; иначе расчётная себестоимость">
          <div className="divide-y divide-neutral-100">
            {line('остаток на начало', current.opening, { bold: true })}
            {line('выручка от продаж', current.revenue, { sign: '+' })}
            {line('инвестиции', current.investments, { sign: '+' })}
            {line('прочие доходы', current.other_income, { sign: '+' })}
            {line(current.cogs_is_actual ? 'закупки сырья (факт)' : 'закупки сырья (расчёт)', current.cogs_cash, { sign: '−' })}
            {line('операционные расходы', current.opex, { sign: '−' })}
            {line(tax_label(state), current.tax, { sign: '−' })}
            {line('ндфл', current.ndfl, { sign: '−' })}
            {current.insurance > 0 ? line('страховые', current.insurance, { sign: '−' }) : null}
            {line('оборудование (capex)', current.capex, { sign: '−' })}
            {line('прочие расходы', current.other_expense, { sign: '−' })}
            {line('чистый поток', current.net, { bold: true })}
            {line('остаток на конец', current.closing, { bold: true })}
          </div>
        </Card>

        <Card title="ручные корректировки месяца" hint="если вложения или покупка оборудования не заведены отдельными операциями">
          {invest_inputs}
        </Card>
      </div>

      <Card title="по месяцам">
        <TableWrap>
          <thead>
            <tr>
              <th className={th_class}>месяц</th>
              <th className={th_num_class}>начало</th>
              <th className={th_num_class}>приход</th>
              <th className={th_num_class}>расход</th>
              <th className={th_num_class}>поток</th>
              <th className={th_num_class}>конец</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${r.month === month ? 'bg-neutral-50 font-medium' : ''}`} onClick={() => set_month(r.month)}>
                <td className={td_class}>{month_label(r.month)}</td>
                <td className={td_num_class}>{format_rub(r.opening)}</td>
                <td className={`${td_num_class} text-emerald-600`}>{format_rub(r.inflow)}</td>
                <td className={`${td_num_class} text-red-500`}>{format_rub(r.outflow)}</td>
                <td className={`${td_num_class} ${r.net >= 0 ? '' : 'text-red-500'}`}>{format_rub(r.net)}</td>
                <td className={`${td_num_class} font-semibold ${r.closing >= 0 ? '' : 'text-red-500'}`}>{format_rub(r.closing)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
