'use client';

import { useMemo } from 'react';
import { format_rub, month_label, summarize_month, tax_label } from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { Card, EmptyState, StatCard, TableWrap, td_class, td_num_class, th_class, th_num_class } from '@/components/admin/finance/ui';

export default function PnlSection({ state, month, set_month }: section_props) {
  const rows = useMemo(() => state.monthsData.map((m) => summarize_month(state, m)), [state]);
  const cur = rows.find((r) => r.month === month);
  if (!cur) return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;

  const pct = (v: number) => (cur.revenue > 0 ? `${((v / cur.revenue) * 100).toFixed(1)}%` : '—');

  const line = (label: string, value: number, opts?: { bold?: boolean; sign?: '−' | '+'; sub?: boolean }) => (
    <div className={`flex items-center justify-between gap-4 py-1.5 text-sm ${opts?.bold ? 'font-semibold text-neutral-900' : opts?.sub ? 'pl-4 text-neutral-500' : 'text-neutral-700'}`}>
      <span>{label}</span>
      <span className="flex items-center gap-4 tabular-nums">
        <span className="w-14 text-right text-xs text-neutral-400">{pct(value)}</span>
        <span className={opts?.bold && value < 0 ? 'text-red-500' : ''}>
          {opts?.sign ? `${opts.sign} ` : ''}
          {format_rub(value)}
        </span>
      </span>
    </div>
  );

  const gross = cur.revenue - cur.cogs;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`выручка · ${month_label(month)}`} value={format_rub(cur.revenue)} tone="accent" />
        <StatCard label="валовая прибыль" value={format_rub(gross)} hint={pct(gross)} />
        <StatCard label="ebitda" value={format_rub(cur.ebitda)} tone={cur.ebitda >= 0 ? 'default' : 'bad'} hint={pct(cur.ebitda)} />
        <StatCard label="чистая прибыль" value={format_rub(cur.net_profit)} tone={cur.net_profit >= 0 ? 'good' : 'bad'} hint={`${(cur.margin * 100).toFixed(1)}% рентабельность`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`прибыль · ${month_label(month)}`} hint="доля от выручки — в серой колонке">
          <div className="divide-y divide-neutral-100">
            {line('выручка', cur.revenue, { bold: true })}
            {line('себестоимость продаж', cur.cogs, { sign: '−' })}
            {cur.cogs_sold > 0 && cur.cogs_sold !== cur.cogs_calc ? line('в т.ч. по техкартам (план)', cur.cogs_calc, { sub: true }) : null}
            {cur.cogs_staff > 0 ? line('напитки персонала', cur.cogs_staff, { sign: '−' }) : null}
            {cur.cogs_writeoff > 0 ? line('списания склада', cur.cogs_writeoff, { sign: '−' }) : null}
            {line('валовая прибыль', gross, { bold: true })}
            {line('операционные расходы', cur.opex, { sign: '−' })}
            {line('в т.ч. фот', cur.salary, { sub: true })}
            {line('прочие расходы', cur.other_expense, { sign: '−' })}
            {line('прочие доходы', cur.other_income, { sign: '+' })}
            {line('ebitda', cur.ebitda, { bold: true })}
            {line('амортизация', cur.amortization, { sign: '−' })}
            {line(tax_label(state), cur.tax, { sign: '−' })}
            {line(`ндфл ${state.ndflRate}% с фот`, cur.ndfl, { sign: '−' })}
            {cur.insurance > 0 ? line('страховые взносы', cur.insurance, { sign: '−' }) : null}
            {line('чистая прибыль', cur.net_profit, { bold: true })}
          </div>
        </Card>
        <Card title="ключевые показатели">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="точка безубыточности" value={format_rub(cur.break_even)} hint="выручка в месяц, при которой прибыль = 0" />
            <StatCard label="запас прочности" value={cur.revenue > 0 && cur.break_even > 0 ? `${(((cur.revenue - cur.break_even) / cur.revenue) * 100).toFixed(0)}%` : '—'} hint="на сколько можно упасть до нуля" />
            <StatCard label="средняя себестоимость напитка" value={cur.drinks_sold ? format_rub(cur.cogs / cur.drinks_sold) : '—'} />
            <StatCard label="средняя цена напитка" value={cur.drinks_sold ? format_rub(cur.revenue / cur.drinks_sold) : '—'} hint={`${cur.drinks_sold} шт продано`} />
            <StatCard label="фудкост" value={pct(cur.cogs)} hint="сырьё из заказов / выручка · норма 25–35%" tone={cur.revenue > 0 && cur.cogs / cur.revenue > 0.35 ? 'bad' : 'default'} />
            <StatCard label="закупки (касса)" value={cur.cogs_actual > 0 ? format_rub(cur.cogs_actual) : '—'} hint="это приход на склад, не себестоимость продаж" />
          </div>
        </Card>
      </div>

      <Card title="по месяцам">
        <TableWrap>
          <thead>
            <tr>
              <th className={th_class}>месяц</th>
              <th className={th_num_class}>выручка</th>
              <th className={th_num_class}>себест.</th>
              <th className={th_num_class}>opex</th>
              <th className={th_num_class}>налоги</th>
              <th className={th_num_class}>ebitda</th>
              <th className={th_num_class}>чистая</th>
              <th className={th_num_class}>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${r.month === month ? 'bg-neutral-50 font-medium' : ''}`} onClick={() => set_month(r.month)}>
                <td className={td_class}>{month_label(r.month)}</td>
                <td className={td_num_class}>{format_rub(r.revenue)}</td>
                <td className={td_num_class}>{format_rub(r.cogs)}</td>
                <td className={td_num_class}>{format_rub(r.opex + r.amortization)}</td>
                <td className={td_num_class}>{format_rub(r.tax + r.ndfl + r.insurance)}</td>
                <td className={td_num_class}>{format_rub(r.ebitda)}</td>
                <td className={`${td_num_class} font-semibold ${r.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{format_rub(r.net_profit)}</td>
                <td className={`${td_num_class} text-neutral-500`}>{(r.margin * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
