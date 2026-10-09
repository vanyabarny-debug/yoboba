'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  cashflow_table,
  format_rub,
  month_label,
  summarize_month,
  tax_label,
  with_fact_cashflow,
  with_fact_revenue,
} from '@/lib/finance/model';
import type { section_props } from '@/components/admin/finance/use-finance';
import { Card, EmptyState, TableWrap, td_class, td_num_class, th_class, th_num_class } from '@/components/admin/finance/ui';
import OpexSection from '@/components/admin/finance/opex-section';
import TransactionsSection from '@/components/admin/finance/transactions-section';
import SettingsSection from '@/components/admin/finance/settings-section';
import CashflowSection from '@/components/admin/finance/cashflow-section';

type money_tab = 'report' | 'spend' | 'ops' | 'setup';

type fact_response = { month: string; revenue: number; orders: number; error?: string };

function Line({
  label,
  value,
  sign,
  bold,
  sub,
  share,
}: {
  label: string;
  value: number;
  sign?: '−' | '+';
  bold?: boolean;
  sub?: boolean;
  share?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-1.5 text-sm ${
        bold ? 'font-semibold text-neutral-900' : sub ? 'pl-4 text-neutral-500' : 'text-neutral-700'
      }`}
    >
      <span>{label}</span>
      <span className="flex items-center gap-3 tabular-nums">
        {share ? <span className="w-12 text-right text-[11px] text-neutral-400">{share}</span> : null}
        <span className={bold && value < 0 ? 'text-red-500' : ''}>
          {sign ? `${sign} ` : ''}
          {format_rub(value)}
        </span>
      </span>
    </div>
  );
}

export default function MoneySection(props: section_props) {
  const { state, month, set_month, spot_id = '' } = props;
  const [tab, set_tab] = useState<money_tab>('report');
  const [fact, set_fact] = useState<fact_response | null>(null);
  const md = state.monthsData.find((m) => m.month === month);
  const cur_plan = md ? summarize_month(state, md) : null;
  const flow = useMemo(() => cashflow_table(state), [state]);
  const cash_plan = flow.find((r) => r.month === month);
  const rows_plan = useMemo(() => state.monthsData.map((m) => summarize_month(state, m)), [state]);

  useEffect(() => {
    let cancelled = false;
    const spot_q = spot_id ? `&spot_id=${encodeURIComponent(spot_id)}` : '';
    fetch(`/api/admin/finance/sales?month=${month}${spot_q}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: fact_response) => {
        if (cancelled || body.error) return;
        set_fact(body);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month, spot_id]);

  if (!md || !cur_plan || !cash_plan) {
    return <EmptyState>месяц {month_label(month)} ещё не создан — добавьте его сверху</EmptyState>;
  }

  const fact_rev = fact?.month === month ? fact.revenue : 0;
  const cur = with_fact_revenue(cur_plan, fact_rev, state);
  const cash = with_fact_cashflow(cash_plan, cur);
  const rows = rows_plan.map((r) =>
    r.month === month ? with_fact_revenue(r, fact_rev, state) : r
  );
  const flow_live = flow.map((r) => (r.month === month ? cash : r));

  const pct = (v: number) => (cur.revenue > 0 ? `${((v / cur.revenue) * 100).toFixed(0)}%` : '');
  const gross = cur.revenue - cur.cogs;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {(
          [
            ['report', 'отчёт'],
            ['spend', 'расходы'],
            ['ops', 'операции'],
            ['setup', 'ещё'],
          ] as [money_tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => set_tab(id)}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-accent text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="прибыль" hint="считается из заказов, склада и расходов">
              <div className="divide-y divide-neutral-100">
                <Line label="выручка" value={cur.revenue} bold share={pct(cur.revenue)} />
                <Line label="себестоимость продаж" value={cur.cogs} sign="−" share={pct(cur.cogs)} />
                {cur.cogs_staff > 0 ? <Line label="напитки персонала" value={cur.cogs_staff} sign="−" sub /> : null}
                {cur.cogs_writeoff > 0 ? <Line label="списания" value={cur.cogs_writeoff} sign="−" sub /> : null}
                <Line label="валовая прибыль" value={gross} bold share={pct(gross)} />
                <Line label="постоянные расходы" value={cur.opex} sign="−" />
                {cur.salary > 0 ? <Line label="в т.ч. фот" value={cur.salary} sub /> : null}
                {cur.other_expense > 0 ? <Line label="прочие расходы" value={cur.other_expense} sign="−" /> : null}
                {cur.other_income > 0 ? <Line label="прочие доходы" value={cur.other_income} sign="+" /> : null}
                <Line label={tax_label(state)} value={cur.tax} sign="−" />
                <Line label="ндфл" value={cur.ndfl} sign="−" />
                {cur.insurance > 0 ? <Line label="страховые" value={cur.insurance} sign="−" /> : null}
                {cur.amortization > 0 ? <Line label="амортизация" value={cur.amortization} sign="−" /> : null}
                <Line label="чистая прибыль" value={cur.net_profit} bold share={pct(cur.net_profit)} />
              </div>
            </Card>
            <Card
              title="деньги в кармане"
              hint="сколько заработало и сколько ушло — и что осталось «в кассе» бизнеса"
            >
              <p className="mb-3 text-sm leading-snug text-neutral-500">
                это не ящик на точке. слева прибыль «на бумаге», здесь — проще: пришло минус
                потратили. минус значит, что расходов больше, чем выручки.
              </p>
              <div className="divide-y divide-neutral-100">
                <Line label="было на старте месяца" value={cash.opening} bold />
                <Line label="пришло с продаж" value={cash.revenue} sign="+" />
                {cash.investments > 0 ? <Line label="вложили своих" value={cash.investments} sign="+" /> : null}
                {cash.other_income > 0 ? <Line label="прочие приходы" value={cash.other_income} sign="+" /> : null}
                <Line
                  label={cash.cogs_is_actual ? 'купили сырьё' : 'сырьё (оценка)'}
                  value={cash.cogs_cash}
                  sign="−"
                />
                <Line label="аренда, зп и прочее" value={cash.opex} sign="−" />
                <Line label="налоги и взносы" value={cash.tax + cash.ndfl + cash.insurance} sign="−" />
                {cash.capex > 0 ? <Line label="купили оборудование" value={cash.capex} sign="−" /> : null}
                {cash.other_expense > 0 ? <Line label="прочие траты" value={cash.other_expense} sign="−" /> : null}
                <Line label="за месяц осталось" value={cash.net} bold />
                <Line label="итого сейчас" value={cash.closing} bold />
              </div>
            </Card>
          </div>

          <Card title="по месяцам" hint="нажмите строку — откроется этот месяц">
            <TableWrap>
              <thead>
                <tr>
                  <th className={th_class}>месяц</th>
                  <th className={th_num_class}>выручка</th>
                  <th className={th_num_class}>себест.</th>
                  <th className={th_num_class}>расходы</th>
                  <th className={th_num_class}>чистая</th>
                  <th className={th_num_class}>касса</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = flow_live.find((x) => x.month === r.month);
                  return (
                    <tr
                      key={r.month}
                      className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${
                        r.month === month ? 'bg-neutral-50 font-medium' : ''
                      }`}
                      onClick={() => set_month(r.month)}
                    >
                      <td className={td_class}>{month_label(r.month)}</td>
                      <td className={td_num_class}>{format_rub(r.revenue)}</td>
                      <td className={td_num_class}>{format_rub(r.cogs)}</td>
                      <td className={td_num_class}>{format_rub(r.opex)}</td>
                      <td className={`${td_num_class} ${r.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {format_rub(r.net_profit)}
                      </td>
                      <td className={td_num_class}>{format_rub(c?.closing ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </Card>
        </div>
      )}

      {tab === 'spend' && <OpexSection {...props} compact />}
      {tab === 'ops' && (
        <div className="space-y-4">
          <TransactionsSection {...props} compact />
          <details className="rounded-3xl border border-neutral-200/80 bg-white p-4 shadow-soft">
            <summary className="cursor-pointer text-sm font-medium text-neutral-700">вложения и оборудование вручную</summary>
            <div className="mt-3">
              <CashflowSection {...props} compact />
            </div>
          </details>
        </div>
      )}
      {tab === 'setup' && <SettingsSection {...props} />}
    </div>
  );
}
