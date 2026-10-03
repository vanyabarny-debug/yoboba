'use client';

import { useEffect, useState, createElement } from 'react';
import online_counter from '@/components/admin/online-counter';
import live_carts from '@/components/admin/live-carts';
import { use_finance, save_label } from '@/components/admin/finance/use-finance';
import { PeriodPicker, chip_active, chip_idle } from '@/components/admin/finance/ui';
import SalesSection from '@/components/admin/finance/sales-section';
import DashboardSection from '@/components/admin/finance/dashboard-section';
import MoneySection from '@/components/admin/finance/money-section';
import ModelSection from '@/components/admin/finance/model-section';

type stats = {
  orders_today: number;
  revenue_today: number;
  orders_week: number;
  revenue_week: number;
  avg_check_week: number;
  items_today: number;
};

type pane = 'dash' | 'plan' | 'money' | 'model';

export default function business_dashboard() {
  const [pulse, set_pulse] = useState<stats | null>(null);
  const [pane, set_pane] = useState<pane>('dash');
  const finance = use_finance();

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: stats & { error?: string }) => {
        if (body.error) return;
        set_pulse(body);
      })
      .catch(() => {});
  }, []);

  const section = finance.state
    ? {
        state: finance.state,
        set_state: finance.set_state,
        month: finance.month,
        set_month: finance.set_month,
        from: finance.from,
        to: finance.to,
        set_period: finance.set_period,
        menu: finance.menu,
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-pill border border-neutral-200/80 bg-white p-1 shadow-soft">
          {(
            [
              ['dash', 'дашборд'],
              ['plan', 'план'],
              ['money', 'деньги'],
              ['model', 'модель'],
            ] as [pane, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => set_pane(id)} className={`shrink-0 ${pane === id ? chip_active : chip_idle}`}>
              {label}
            </button>
          ))}
        </div>
        {finance.state && (
          <div className="flex items-center gap-3">
            <span
              className={`hidden text-xs sm:inline ${
                finance.save_status === 'error' ? 'text-red-500' : finance.save_status === 'saved' ? 'text-emerald-600' : 'text-neutral-400'
              }`}
            >
              {save_label(finance.save_status)}
            </span>
            <PeriodPicker from={finance.from} to={finance.to} on_change={finance.set_period} />
          </div>
        )}
      </div>

      {finance.loading ? (
        <p className="text-sm text-neutral-500">загрузка…</p>
      ) : finance.error ? (
        <p className="text-sm text-red-500">{finance.error}</p>
      ) : (
        section && (
          <>
            {pane === 'dash' && (
              <div className="space-y-5">
                <DashboardSection {...section} pulse={pulse} on_open_model={() => set_pane('model')} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">{createElement(online_counter)}</div>
                  <div>{createElement(live_carts)}</div>
                </div>
              </div>
            )}
            {pane === 'plan' && <SalesSection {...section} />}
            {pane === 'money' && <MoneySection {...section} />}
            {pane === 'model' && <ModelSection {...section} />}
          </>
        )
      )}
    </div>
  );
}
