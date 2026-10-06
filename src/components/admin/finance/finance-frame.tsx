'use client';

import type { ReactNode } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import { PeriodPicker } from '@/components/admin/finance/ui';
import { save_label, use_finance, type section_props } from '@/components/admin/finance/use-finance';

export default function FinanceFrame({
  title,
  hint,
  show_month = false,
  show_heading = true,
  children,
}: {
  title: string;
  hint?: string;
  show_month?: boolean;
  show_heading?: boolean;
  children: (p: section_props) => ReactNode;
}) {
  const f = use_finance();
  const status = save_label(f.save_status);
  const heading = show_heading || show_month;

  return (
    <AdminShell
      wide
      actions={
        <span
          className={`hidden text-xs sm:inline ${
            f.save_status === 'error' ? 'text-red-500' : f.save_status === 'saved' ? 'text-emerald-600' : 'text-neutral-400'
          }`}
        >
          {status}
        </span>
      }
    >
      {heading && (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {show_heading && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">yoSquad</p>
          <h1 className="font-heading-soft text-2xl tracking-tight text-neutral-900">{title}</h1>
          {hint && <p className="mt-0.5 text-xs font-normal text-neutral-500">{hint}</p>}
        </div>
        )}
        {show_month && f.state && (
          <PeriodPicker from={f.from} to={f.to} on_change={f.set_period} />
        )}
      </div>
      )}
      {f.error && <p className="text-sm text-red-500">{f.error}</p>}
      {f.loading && <p className="text-sm text-neutral-500">загрузка…</p>}
      {f.state &&
        children({
          state: f.state,
          set_state: f.set_state,
          month: f.month,
          set_month: f.set_month,
          from: f.from,
          to: f.to,
          set_period: f.set_period,
          menu: f.menu,
          set_menu: f.set_menu,
        })}
    </AdminShell>
  );
}
