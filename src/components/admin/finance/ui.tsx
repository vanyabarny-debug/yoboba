'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { menu_item } from '@/lib/types';
import { add_days, days_in_month, format_period, moscow_today } from '@/lib/finance/model';

export const field_class =
  'w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:bg-neutral-50 disabled:text-neutral-400';

export const cell_input_class =
  'w-full rounded-xl border border-neutral-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-neutral-900 outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20';

/** кастомный select — как переключатель точки, без системного меню */
export function MenuSelect({
  value,
  options,
  on_change,
  placeholder = 'выбрать',
  className = '',
  menu_className = '',
  align = 'left',
}: {
  value: string;
  options: { id: string; label: string; hint?: string }[];
  on_change: (id: string) => void;
  placeholder?: string;
  className?: string;
  menu_className?: string;
  align?: 'left' | 'right';
}) {
  const [open, set_open] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function on_down(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) set_open(false);
    }
    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    document.addEventListener('keydown', on_key);
    return () => {
      document.removeEventListener('mousedown', on_down);
      document.removeEventListener('keydown', on_key);
    };
  }, [open]);

  return (
    <div className={`relative min-w-0 ${className}`} ref={root}>
      <button
        type="button"
        onClick={() => set_open((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-1.5 rounded-xl border border-neutral-200/80 bg-white px-3 py-1.5 text-left text-sm text-neutral-900 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      >
        <span className={`min-w-0 flex-1 truncate ${current ? 'font-medium' : 'text-neutral-400'}`}>
          {current?.label || placeholder}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          role="listbox"
          className={`absolute top-full z-[70] mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-neutral-200/80 bg-white p-1.5 shadow-soft ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menu_className || 'w-[min(20rem,calc(100vw-2rem))]'}`}
        >
          {options.map((opt) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id || '__empty'}
                type="button"
                role="option"
                aria-selected={active}
                className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent/10 font-semibold text-accent'
                    : 'text-neutral-800 hover:bg-neutral-50'
                }`}
                onClick={() => {
                  on_change(opt.id);
                  set_open(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">{opt.label}</span>
                  {opt.hint ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-neutral-400">{opt.hint}</span>
                  ) : null}
                </span>
                {active ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    className="mt-0.5 shrink-0 text-accent"
                  >
                    <path
                      d="M5 12.5l5 5L19 7"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export const btn_primary =
  'inline-flex items-center justify-center rounded-pill bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_6px_18px_rgba(255,107,107,0.28)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50';

export const btn_secondary =
  'inline-flex items-center justify-center rounded-pill border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-accent/10 hover:border-accent/30 disabled:cursor-not-allowed disabled:opacity-50';

export const btn_accent = btn_primary;

export const btn_ghost_danger =
  'rounded-pill px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600';

export const chip_active = 'rounded-pill bg-accent px-3 py-1.5 text-sm font-medium text-white';
export const chip_idle =
  'rounded-pill px-3 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-accent/10 hover:text-neutral-800';

export function DrinkThumb({
  item,
  size = 'sm',
}: {
  item?: menu_item | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const box = size === 'xl' ? 'h-28 w-28' : size === 'lg' ? 'h-20 w-20' : size === 'md' ? 'h-16 w-16' : 'h-12 w-12';
  const radius = size === 'xl' ? 'rounded-3xl' : 'rounded-2xl';
  const frame = size === 'xl' ? 'bg-transparent' : 'bg-white';
  const src = item?.image_url?.trim();
  return (
    <div className={`${box} ${radius} ${frame} shrink-0 overflow-hidden`}>
      {src ? (
        // прямое фото из меню — без ленивой обёртки, иначе в списке остаются пустые кружки
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain" />
      ) : (
        <div className="h-full w-full bg-accent/10" />
      )}
    </div>
  );
}

export type business_tone = 'minus' | 'zero' | 'plus' | 'ok' | 'great';

const status_word: Record<business_tone, string> = {
  minus: 'в минус',
  zero: 'в ноль',
  plus: 'в плюс',
  ok: 'нормально',
  great: 'очень охуенно',
};

const status_ink: Record<business_tone, string> = {
  minus: '#FF8B8B',
  zero: 'rgba(255,255,255,0.72)',
  plus: '#F4C7A1',
  ok: '#D7F5EA',
  great: '#FFE08A',
};

export function BusinessStatusCard({
  tone,
  detail,
  net,
  net_approx = false,
  net_label = 'чистая',
  className = '',
}: {
  tone: business_tone;
  detail?: string;
  /** чистая / ориентир — в той же плашке */
  net?: number;
  net_approx?: boolean;
  net_label?: string;
  className?: string;
}) {
  const show_net = net != null && Number.isFinite(net);
  const net_abs = show_net ? Math.abs(Math.round(net)) : 0;
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-[#20181B] px-6 py-7 text-white shadow-soft ${className}`}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 opacity-80" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-white/10" />
        <span className="absolute inset-8 rounded-full border border-white/10" />
        <span className="absolute inset-16 rounded-full border border-white/[0.14]" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
      </div>
      <p className="relative text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">статус бизнеса</p>
      <p
        className="relative mt-3 font-heading-soft text-4xl tracking-tight sm:text-5xl"
        style={{ color: status_ink[tone] }}
      >
        {status_word[tone]}
      </p>
      {show_net ? (
        <div className="relative mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">{net_label}</p>
          <p className="mt-1 font-heading-soft text-3xl tabular-nums tracking-tight sm:text-4xl">
            {`${net_approx ? '~' : ''}${net! > 0 ? '' : net! < 0 ? '−' : ''}${format_rub_safe(net_abs)}`}
          </p>
        </div>
      ) : null}
      {detail ? <p className="relative mt-3 max-w-[20rem] text-sm leading-snug text-white/55">{detail}</p> : null}
    </div>
  );
}

export function BreakEvenCard({
  value,
  title = 'точка безубыточности',
  detail,
  empty_hint,
  approx = false,
  action,
  className = '',
}: {
  value: number;
  title?: string;
  detail?: string;
  empty_hint?: string;
  approx?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-[#20181B] px-6 py-7 text-white shadow-soft ${className}`}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 opacity-80" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-white/10" />
        <span className="absolute inset-8 rounded-full border border-white/10" />
        <span className="absolute inset-16 rounded-full border border-white/[0.14]" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
      </div>
      <p className="relative text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">{title}</p>
      <p className="relative mt-3 font-heading-soft text-4xl tabular-nums tracking-tight sm:text-5xl">
        {value === 0 && !detail
          ? '—'
          : `${approx ? '~' : ''}${value > 0 ? '' : value < 0 ? '−' : ''}${format_rub_safe(Math.abs(value))}`}
      </p>
      <p className="relative mt-3 max-w-[17rem] text-sm leading-snug text-white/60">
        {detail ||
          (value > 0
            ? 'минимальная выручка в месяц, ниже которой точка работает в убыток'
            : empty_hint || 'задайте постоянные расходы — появится порог безубыточности')}
      </p>
      {action ? <div className="relative mt-5">{action}</div> : null}
    </div>
  );
}

export function RentabilityCard({
  value,
  detail,
  approx = false,
  className = '',
}: {
  /** доля, 0–1 или уже в процентах > 1 — если |value| <= 1, считаем долей */
  value: number;
  detail?: string;
  approx?: boolean;
  className?: string;
}) {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const shown = Number.isFinite(pct) ? Math.round(pct) : 0;
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-[#20181B] px-6 py-7 text-white shadow-soft ${className}`}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 opacity-80" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-white/10" />
        <span className="absolute inset-8 rounded-full border border-white/10" />
        <span className="absolute inset-16 rounded-full border border-white/[0.14]" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25" />
      </div>
      <p className="relative text-[11px] font-medium uppercase tracking-[0.16em] text-white/45">рентабельность</p>
      <p className="relative mt-3 font-heading-soft text-4xl tabular-nums tracking-tight sm:text-5xl">
        {shown === 0 && !detail ? '—' : `${approx ? '~' : ''}${shown < 0 ? '−' : ''}${Math.abs(shown)}%`}
      </p>
      <p className="relative mt-3 max-w-[14rem] text-sm leading-snug text-white/60">
        {detail || 'чистая прибыль / выручка'}
      </p>
    </div>
  );
}

function format_rub_safe(n: number) {
  return `${(Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;
}

export function Card({
  title,
  hint,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border border-neutral-200/80 bg-white p-4 shadow-soft ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-heading-soft text-sm text-neutral-900">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs font-normal text-neutral-500">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'accent';
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'bad'
        ? 'text-red-500'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-neutral-900';
  return (
    <div className="rounded-3xl border border-neutral-200/80 bg-white p-4 shadow-soft">
      <p className="mb-1 text-xs font-normal text-neutral-500">{label}</p>
      <p className={`font-heading-soft text-2xl tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] font-normal text-neutral-400">{hint}</p>}
    </div>
  );
}

export function NumInput({
  value,
  on_change,
  min,
  step,
  placeholder,
  className,
  disabled,
}: {
  value: number | undefined | null;
  on_change: (v: number) => void;
  min?: number;
  step?: number | 'any';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step ?? 'any'}
      placeholder={placeholder}
      disabled={disabled}
      className={className ?? cell_input_class}
      value={value == null || Number.isNaN(value) ? '' : value}
      onChange={(e) => on_change(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-accent/25 bg-accent/5 px-4 py-8 text-center text-sm font-normal text-neutral-500">
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="font-heading-soft text-base text-neutral-900">{children}</h2>
      {hint && <p className="mt-0.5 text-xs font-normal text-neutral-500">{hint}</p>}
    </div>
  );
}

/** переключатель точки / все — рядом с периодом */
export function SpotPicker({
  spots,
  value,
  on_change,
}: {
  spots: { id: string; label: string }[];
  /** '' = все точки */
  value: string;
  on_change: (spot_id: string) => void;
}) {
  if (!spots.length) {
    return (
      <span className={`${field_class} flex w-auto items-center rounded-pill px-4 text-sm text-neutral-400`}>
        нет точек
      </span>
    );
  }
  return (
    <select
      className={`${field_class} w-auto min-w-[9rem] max-w-[14rem] rounded-pill px-4 py-2 text-sm`}
      value={value}
      onChange={(e) => on_change(e.target.value)}
      aria-label="точка"
    >
      <option value="">все точки{spots.length > 1 ? ' · среднее' : ''}</option>
      {spots.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function PeriodPicker({
  from,
  to,
  on_change,
}: {
  from: string;
  to: string;
  on_change: (from: string, to: string) => void;
}) {
  const [open, set_open] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const today = moscow_today();
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;

  useEffect(() => {
    function on_down(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) set_open(false);
    }
    document.addEventListener('mousedown', on_down);
    return () => document.removeEventListener('mousedown', on_down);
  }, []);

  function apply(next_from: string, next_to: string) {
    const x = next_from <= next_to ? next_from : next_to;
    const y = next_from <= next_to ? next_to : next_from;
    on_change(x, y);
  }

  const month_start = `${today.slice(0, 8)}01`;
  const prev_month = (() => {
    const [y, m] = today.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { from: `${id}-01`, to: `${id}-${String(days_in_month(id)).padStart(2, '0')}` };
  })();

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => set_open((v) => !v)}
        className="flex w-auto min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-neutral-900 transition-colors hover:bg-surface/70"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-neutral-400">
          <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="flex-1 truncate">{format_period(a, b)}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-[18rem] rounded-2xl border border-neutral-200/80 bg-white p-3 shadow-soft">
          <p className="text-[11px] text-neutral-400">любые даты — график и цифры за этот период</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-400">
              с
              <input
                type="date"
                className={`${field_class} mt-1 rounded-xl px-2 py-1.5`}
                value={a}
                max={today}
                onChange={(e) => {
                  if (e.target.value) apply(e.target.value, b);
                }}
              />
            </label>
            <label className="text-[11px] text-neutral-400">
              по
              <input
                type="date"
                className={`${field_class} mt-1 rounded-xl px-2 py-1.5`}
                value={b}
                max={today}
                onChange={(e) => {
                  if (e.target.value) apply(a, e.target.value);
                }}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ['сегодня', today, today],
                ['7 дней', add_days(today, -6), today],
                ['этот месяц', month_start, today],
                ['прошлый месяц', prev_month.from, prev_month.to],
              ] as [string, string, string][]
            ).map(([label, f, t]) => (
              <button
                key={label}
                type="button"
                className="rounded-pill bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-accent/10 hover:text-neutral-900"
                onClick={() => {
                  apply(f, t);
                  set_open(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MonthPicker({
  months,
  value,
  on_change,
  on_add,
  label_of,
}: {
  months: string[];
  value: string;
  on_change: (m: string) => void;
  on_add?: (m: string) => void;
  label_of: (m: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={`${field_class} w-auto min-w-[180px] rounded-pill px-4`}
        value={value}
        onChange={(e) => on_change(e.target.value)}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {label_of(m)}
          </option>
        ))}
      </select>
      {on_add && (
        <label className={`${btn_secondary} cursor-pointer px-3`} title="добавить месяц">
          +
          <input
            type="month"
            className="sr-only"
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                on_add(e.target.value);
                e.target.value = '';
              }
            }}
          />
        </label>
      )}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

export const th_class = 'px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400';
export const th_num_class = `${th_class} text-right`;
export const td_class = 'px-2 py-2 align-middle text-neutral-800';
export const td_num_class = `${td_class} text-right tabular-nums`;
