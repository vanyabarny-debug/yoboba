'use client';

import { useEffect, useMemo, useState } from 'react';
import { FLOATING_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';
import { format_ml, parse_ml } from '@/lib/finance/weigh';

type row = {
  id: string;
  name: string;
  qty: number;
  unit: 'g' | 'ml' | 'pcs';
  qtyLabel: string;
};

const ML_CHIPS = [
  { add: 100, label: '+100' },
  { add: 250, label: '+250' },
  { add: 500, label: '+500' },
  { add: 1000, label: '+1 л' },
];

const TINT = { bg: '#FDECEC', fg: '#B42318', border: '#F5C2C2' };

export function stock_writeoff_card({ on_open }: { on_open: () => void }) {
  return (
    <article
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border"
      style={{ backgroundColor: TINT.bg, borderColor: TINT.border, color: TINT.fg, containerType: 'size' }}
    >
      <button
        type="button"
        onClick={on_open}
        className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3 active:scale-[0.98]"
        aria-label="списание со склада"
      >
        <div className="flex aspect-square w-[min(100%,64cqh)] max-w-[9.5rem] items-center justify-center">
          <span className="flex h-[62%] w-[62%] items-center justify-center rounded-full border-[6px] border-current text-[clamp(2rem,12cqw,3.2rem)] font-bold leading-none">
            −
          </span>
        </div>
        <p className="mt-1 max-w-[92%] truncate text-center text-[clamp(0.7rem,3cqw,0.95rem)] font-bold leading-snug">
          списание
        </p>
        <p className="mt-0.5 max-w-[92%] truncate text-center text-[clamp(0.6rem,2.6cqw,0.78rem)] font-semibold opacity-90">
          со склада
        </p>
      </button>
    </article>
  );
}

export function StockWriteoffSheet({ spot_id, on_close }: { spot_id: string; on_close: () => void }) {
  const [rows, set_rows] = useState<row[] | null>(null);
  const [query, set_query] = useState('');
  const [picked, set_picked] = useState<row | null>(null);
  const [grams, set_grams] = useState('');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const [notice, set_notice] = useState('');

  useEffect(() => {
    const q = spot_id ? `?spot_id=${encodeURIComponent(spot_id)}` : '';
    let cancelled = false;
    fetch(`/api/seller/writeoff${q}`, { credentials: 'same-origin' })
      .then(async (res) => {
        const body = (await res.json()) as { rows?: row[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          set_error(body.error || 'не удалось открыть склад');
          set_rows([]);
          return;
        }
        set_rows(body.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          set_error('сеть недоступна');
          set_rows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [spot_id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows ?? [];
    const filtered = q ? list.filter((row) => row.name.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 40);
  }, [rows, query]);

  const liquid = picked?.unit === 'ml';
  const typed_ml = liquid ? parse_ml(grams) : null;
  const amount = liquid ? typed_ml ?? 0 : Math.round(Number(grams.replace(',', '.')));
  const ml_decimal = Boolean(liquid && /[.,]/.test(grams));
  const can_save =
    !!picked &&
    !ml_decimal &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= picked.qty + 0.5;

  async function commit() {
    if (!picked || !can_save || busy) return;
    set_busy(true);
    set_error('');
    set_notice('');
    try {
      const res = await fetch('/api/seller/writeoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          materialId: picked.id,
          qty: amount,
          ...(spot_id ? { spot_id } : {}),
        }),
      });
      const body = (await res.json()) as { rows?: row[]; error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось списать');
        return;
      }
      set_rows(body.rows ?? []);
      const shown = picked.unit === 'ml' ? format_ml(amount) : String(amount);
      set_notice(`списано ${shown} · ${picked.name}`);
      set_grams('');
      const fresh = (body.rows ?? []).find((row) => row.id === picked.id) ?? null;
      set_picked(fresh && fresh.qty > 0.5 ? fresh : null);
    } catch {
      set_error('сеть недоступна');
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label="закрыть"
        onClick={on_close}
      />
      <div className="relative w-full max-w-sm">
        <button type="button" onClick={on_close} className={FLOATING_CLOSE_BTN_CLASS} aria-label="закрыть">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.22)]">
          <div className="px-4 pt-4">
            <p className="text-lg font-bold tracking-tight text-neutral-900">списание</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              кофе себе, пролитое молоко, брак — что угодно со склада, даже если этого нет в меню
            </p>
          </div>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
            <input
              value={query}
              onChange={(e) => set_query(e.target.value)}
              placeholder="найти на складе"
              aria-label="найти на складе"
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm outline-none focus:border-accent"
            />
            {rows == null ? (
              <p className="py-6 text-center text-sm text-neutral-400">загружаю склад…</p>
            ) : (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {visible.map((row) => {
                  const on = picked?.id === row.id;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => {
                          set_picked(row);
                          set_grams('');
                          set_error('');
                          set_notice('');
                        }}
                        className={`flex w-full items-baseline justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm ${
                          on ? 'bg-red-50 font-semibold text-red-800' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <span className="min-w-0 truncate">{row.name}</span>
                        <span className="shrink-0 tabular-nums text-neutral-500">{row.qtyLabel}</span>
                      </button>
                    </li>
                  );
                })}
                {!visible.length ? (
                  <li className="py-4 text-center text-sm text-neutral-400">ничего не нашлось</li>
                ) : null}
              </ul>
            )}
            {picked ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <label className="relative w-36 shrink-0">
                    <input
                      inputMode="numeric"
                      value={grams}
                      onChange={(e) => {
                        set_grams(e.target.value);
                        set_error('');
                      }}
                      placeholder={liquid ? '1280' : 'сколько'}
                      aria-label={liquid ? 'сколько миллилитров списать' : 'сколько списать'}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 pr-10 text-center text-base font-bold tabular-nums outline-none focus:border-accent"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                      {picked.unit === 'pcs' ? 'шт' : liquid ? 'мл' : 'г'}
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !can_save}
                    onClick={() => void commit()}
                    className="min-w-0 flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? '…' : `списать ${picked.name}`}
                  </button>
                </div>
                {liquid ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {ML_CHIPS.map((chip) => (
                        <button
                          key={chip.add}
                          type="button"
                          onClick={() => {
                            const current = parse_ml(grams) ?? 0;
                            set_grams(String(current + chip.add));
                            set_error('');
                          }}
                          className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                    <p className={`text-center text-sm ${ml_decimal ? 'text-red-600' : 'text-neutral-500'}`}>
                      {ml_decimal
                        ? 'пишите миллилитры целиком: 1 л 280 мл — это 1280'
                        : typed_ml
                          ? `спишется ${format_ml(typed_ml)}`
                          : 'в миллилитрах, например 1280'}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            {notice ? <p className="text-center text-sm text-emerald-700">{notice}</p> : null}
            {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
