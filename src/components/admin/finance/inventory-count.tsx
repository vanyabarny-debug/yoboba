'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  format_base_qty,
  type stock_category,
  type stock_row,
} from '@/lib/finance/model';
import {
  parse_qty,
  to_base_qty,
  weigh_hint,
  weigh_kind_of,
  weigh_prompt,
  weigh_unit,
} from '@/lib/finance/weigh';

type answer = { entered: number } | 'skip';

export default function InventoryCount({
  rows,
  cats,
  required = false,
  on_commit,
  on_close,
}: {
  rows: stock_row[];
  cats: stock_category[];
  required?: boolean;
  on_commit: (facts: { materialId: string; qty: number }[], date: string) => void | Promise<void>;
  on_close: () => void;
}) {
  const items = useMemo(() => {
    const order = cats.map((c) => c.id);
    return rows
      .filter((r) => r.material.name.trim())
      .sort((a, b) => {
        const ia = order.indexOf(a.material.category);
        const ib = order.indexOf(b.material.category);
        const ca = ia < 0 ? 999 : ia;
        const cb = ib < 0 ? 999 : ib;
        if (ca !== cb) return ca - cb;
        return a.material.name.localeCompare(b.material.name, 'ru');
      });
  }, [rows, cats]);

  const [phase, set_phase] = useState<'intro' | 'step' | 'review'>('intro');
  const [index, set_index] = useState(0);
  const [draft, set_draft] = useState('');
  const [answers, set_answers] = useState<Record<string, answer>>({});
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const input_ref = useRef<HTMLInputElement>(null);

  const current = items[index];
  const kind = current ? weigh_kind_of(current.material) : 'g';
  const cat_name = current ? cats.find((c) => c.id === current.material.category)?.name : '';

  useEffect(() => {
    if (phase !== 'step') return;
    const id = window.setTimeout(() => {
      input_ref.current?.focus();
      input_ref.current?.select();
    }, 40);
    return () => window.clearTimeout(id);
  }, [phase, index]);

  function remember(value: answer) {
    if (!current) return;
    const next = { ...answers, [current.material.id]: value };
    set_answers(next);
    if (index + 1 >= items.length) {
      set_phase('review');
      return;
    }
    set_index(index + 1);
    set_draft('');
  }

  function go_next() {
    const n = parse_qty(draft);
    if (n == null) return;
    remember({ entered: n });
  }

  function go_back() {
    if (phase === 'review') {
      set_phase('step');
      set_index(Math.max(0, items.length - 1));
      return;
    }
    if (index === 0) {
      set_phase('intro');
      return;
    }
    const prev = items[index - 1];
    const prev_ans = answers[prev.material.id];
    set_index(index - 1);
    set_draft(prev_ans && prev_ans !== 'skip' ? String(prev_ans.entered) : '');
  }

  const review = useMemo(() => {
    return items
      .map((row) => {
        const ans = answers[row.material.id];
        if (!ans || ans === 'skip') return null;
        const fact = to_base_qty(row.material, ans.entered);
        return { row, fact, book: row.qty, delta: fact - row.qty };
      })
      .filter((x): x is { row: stock_row; fact: number; book: number; delta: number } => x != null);
  }, [items, answers]);

  async function commit() {
    if (busy) return;
    set_busy(true);
    set_error('');
    try {
      await on_commit(
        review.map((r) => ({ materialId: r.row.material.id, qty: r.fact })),
        new Date().toISOString()
      );
    } catch (e) {
      set_error(e instanceof Error ? e.message : 'не удалось записать');
      set_busy(false);
    }
  }

  const progress = items.length ? (phase === 'review' ? 1 : phase === 'intro' ? 0 : index / items.length) : 0;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <div className="h-1 bg-neutral-100">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div className="flex items-center justify-between px-5 py-4">
        {phase === 'intro' ? (
          required ? (
            <span />
          ) : (
            <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={on_close}>
              закрыть
            </button>
          )
        ) : (
          <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={go_back} disabled={busy}>
            назад
          </button>
        )}
        {phase === 'step' && items.length > 0 ? (
          <p className="text-sm tabular-nums text-neutral-400">
            {index + 1} / {items.length}
          </p>
        ) : (
          <span />
        )}
        {phase === 'step' ? (
          <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={() => remember('skip')}>
            пропустить
          </button>
        ) : (
          <span className="w-16" />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-16">
        {phase === 'intro' && (
          <div className="w-full max-w-md text-center">
            <p className="text-sm uppercase tracking-[0.16em] text-accent">инвентаризация</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {required ? (
                <>
                  склад обнулён —
                  <br />
                  нужна инвентаризация
                </>
              ) : (
                <>
                  пройдём склад
                  <br />
                  по одной позиции
                </>
              )}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-neutral-500">
              сыпучее — на весах в граммах.
              <br />
              молоко и сиропы — в литрах.
              <br />
              стаканы и моти — в штуках.
            </p>
            <p className="mt-3 text-sm text-neutral-400">
              {required
                ? `${items.length} позиций · остатки сейчас нулевые, продажи не трогаем`
                : `${items.length} позиций · сверка с текущим остатком`}
            </p>
            <button
              type="button"
              className="mt-10 w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
              onClick={() => {
                if (!items.length) {
                  on_close();
                  return;
                }
                set_phase('step');
                set_index(0);
                set_draft('');
              }}
            >
              начать
            </button>
          </div>
        )}

        {phase === 'step' && current && (
          <form
            className="w-full max-w-md text-center"
            onSubmit={(e) => {
              e.preventDefault();
              go_next();
            }}
          >
            {cat_name ? <p className="text-sm text-neutral-400">{cat_name}</p> : null}
            <h1 className="mt-3 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {weigh_prompt(current.material.name, kind)}
            </h1>
            <p className="mt-3 text-sm text-neutral-400">{weigh_hint(kind)}</p>
            <label className="relative mt-10 block">
              <input
                ref={input_ref}
                inputMode="decimal"
                value={draft}
                onChange={(e) => set_draft(e.target.value)}
                placeholder="0"
                className="w-full border-0 border-b border-neutral-200 bg-transparent py-3 pr-12 text-center text-4xl tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-neutral-900"
                aria-label={weigh_unit(kind)}
              />
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-lg text-neutral-400">
                {weigh_unit(kind)}
              </span>
            </label>
            <button
              type="submit"
              disabled={parse_qty(draft) == null}
              className="mt-10 w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white disabled:opacity-30"
            >
              дальше
            </button>
          </form>
        )}

        {phase === 'review' && (
          <div className="flex w-full max-w-md flex-col items-center">
            <p className="text-sm uppercase tracking-[0.16em] text-accent">сверка</p>
            <h1 className="mt-3 text-center text-3xl font-semibold leading-tight tracking-tight">
              {review.length ? 'запишем факт в склад' : 'ничего не посчитали'}
            </h1>
            <ul className="mt-8 max-h-[45vh] w-full overflow-y-auto">
              {review.length === 0 ? (
                <li className="py-6 text-center text-sm text-neutral-400">все позиции пропущены</li>
              ) : (
                review.map(({ row, fact, book, delta }) => (
                  <li key={row.material.id} className="flex items-baseline justify-between gap-3 border-t border-neutral-100 py-3 first:border-t-0">
                    <span className="min-w-0 truncate text-base text-neutral-800">{row.material.name}</span>
                    <span className="shrink-0 text-right text-sm tabular-nums text-neutral-500">
                      {format_base_qty(row.material, book)}
                      <span className="mx-1 text-neutral-300">→</span>
                      <span className={delta === 0 ? 'text-neutral-800' : 'text-neutral-900'}>{format_base_qty(row.material, fact)}</span>
                    </span>
                  </li>
                ))
              )}
            </ul>
            {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
            <div className="mt-8 grid w-full gap-2">
              {review.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  className="w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white disabled:opacity-50"
                  onClick={() => void commit()}
                >
                  {busy ? 'записываю…' : `записать ${review.length} ${review.length === 1 ? 'позицию' : 'позиций'}`}
                </button>
              ) : required ? (
                <button
                  type="button"
                  disabled={busy}
                  className="w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white disabled:opacity-50"
                  onClick={() => void commit()}
                >
                  {busy ? 'записываю…' : 'завершить — остатки нулевые'}
                </button>
              ) : null}
              {required ? null : (
                <button type="button" className="w-full rounded-pill py-3 text-sm text-neutral-400 hover:text-neutral-700" onClick={on_close} disabled={busy}>
                  не сохранять
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
