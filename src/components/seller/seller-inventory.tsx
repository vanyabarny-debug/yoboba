'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import InventoryCount from '@/components/admin/finance/inventory-count';
import {
  format_base_qty,
  type material,
  type material_unit,
  type stock_category,
  type stock_row,
} from '@/lib/finance/model';
import { entered_from_base, parse_qty, to_base_qty, weigh_kind_of, weigh_unit } from '@/lib/finance/weigh';

type public_row = {
  id: string;
  name: string;
  category: string;
  unit: material_unit;
  qty: number;
  low: boolean;
};

type public_cat = { id: string; name: string; color: string };

function as_material(row: public_row): material {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    costPerUnit: 0,
  };
}

function as_stock_row(row: public_row): stock_row {
  const material = as_material(row);
  return { material, qty: row.qty, value: 0, low: row.low };
}

export default function SellerInventory({
  on_nav_depth,
  active = true,
}: {
  on_nav_depth?: (open: boolean) => void;
  active?: boolean;
}) {
  const [rows, set_rows] = useState<public_row[]>([]);
  const [cats, set_cats] = useState<public_cat[]>([]);
  const [must_count, set_must_count] = useState(false);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState('');
  const [query, set_query] = useState('');
  const [category, set_category] = useState('все');
  const [count_open, set_count_open] = useState(false);
  const [edit, set_edit] = useState<public_row | null>(null);
  const [edit_draft, set_edit_draft] = useState('');
  const [edit_busy, set_edit_busy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/seller/stock', { credentials: 'same-origin' });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      must_count?: boolean;
      categories?: public_cat[];
      rows?: public_row[];
    } | null;
    if (!res.ok) {
      throw new Error(body?.error || 'не удалось загрузить склад');
    }
    set_must_count(Boolean(body?.must_count));
    set_cats(body?.categories ?? []);
    set_rows(body?.rows ?? []);
    set_error('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    set_loading(true);
    load()
      .catch((e) => {
        if (!cancelled) set_error(e instanceof Error ? e.message : 'ошибка склада');
      })
      .finally(() => {
        if (!cancelled) set_loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (active && must_count) set_count_open(true);
  }, [must_count, active]);

  useEffect(() => {
    on_nav_depth?.(active && (count_open || must_count || Boolean(edit)));
    return () => on_nav_depth?.(false);
  }, [count_open, must_count, edit, on_nav_depth, active]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (category !== 'все' && r.category !== category) return false;
      if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [rows, category, query]);

  const count_rows = useMemo(() => rows.map(as_stock_row), [rows]);
  const count_cats = cats as stock_category[];

  async function save_adjust(row: public_row, entered: number) {
    const qty = to_base_qty(as_material(row), entered);
    const res = await fetch('/api/seller/stock', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'adjust', materialId: row.id, qty, note: 'правка кассы' }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      must_count?: boolean;
      categories?: public_cat[];
      rows?: public_row[];
    } | null;
    if (!res.ok) throw new Error(body?.error || 'не удалось сохранить');
    set_must_count(Boolean(body?.must_count));
    if (body?.categories) set_cats(body.categories);
    if (body?.rows) set_rows(body.rows);
  }

  async function save_inventory(facts: { materialId: string; qty: number }[]) {
    const res = await fetch('/api/seller/stock', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'inventory', facts }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      must_count?: boolean;
      categories?: public_cat[];
      rows?: public_row[];
    } | null;
    if (!res.ok) throw new Error(body?.error || 'не удалось записать инвентаризацию');
    set_must_count(Boolean(body?.must_count));
    if (body?.categories) set_cats(body.categories);
    if (body?.rows) set_rows(body.rows);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => set_query(e.target.value)}
          placeholder="найти позицию"
          className="h-9 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-accent/40"
        />
        <button
          type="button"
          onClick={() => set_count_open(true)}
          className="h-9 shrink-0 rounded-xl bg-neutral-900 px-3 text-sm text-white"
        >
          инвентаризация
        </button>
      </div>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => set_category('все')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
            category === 'все' ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
          }`}
        >
          все
        </button>
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => set_category(c.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
              category === c.id ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-600'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="text-sm text-neutral-400">загрузка склада…</p> : null}

      <ul className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-neutral-200 bg-white">
        {!loading && visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-neutral-400">пусто</li>
        ) : (
          visible.map((row) => {
            const mat = as_material(row);
            const tag = cats.find((c) => c.id === row.category);
            return (
              <li key={row.id} className="flex items-center gap-3 border-t border-neutral-100 px-3 py-2.5 first:border-t-0">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag?.color ?? '#8E8E93' }} />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">{row.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    set_edit(row);
                    set_edit_draft(String(entered_from_base(mat, row.qty)));
                    set_error('');
                  }}
                  className={`shrink-0 rounded-lg px-2 py-1 text-sm tabular-nums ${
                    row.qty < 0 || row.low ? 'bg-amber-50 text-amber-700' : 'bg-neutral-50 text-neutral-800'
                  }`}
                >
                  {format_base_qty(mat, row.qty)}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {active && (count_open || must_count) && (
        <InventoryCount
          rows={count_rows}
          cats={count_cats}
          required={must_count}
          on_commit={async (facts) => {
            await save_inventory(facts);
            set_count_open(false);
          }}
          on_close={() => {
            if (must_count) return;
            set_count_open(false);
          }}
        />
      )}

      {active && edit && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={() => {
            if (edit_busy) return;
            set_edit(null);
          }}
        >
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const n = parse_qty(edit_draft);
              if (n == null || edit_busy) return;
              set_edit_busy(true);
              save_adjust(edit, n)
                .then(() => set_edit(null))
                .catch((err) => set_error(err instanceof Error ? err.message : 'ошибка'))
                .finally(() => set_edit_busy(false));
            }}
          >
            <p className="text-xs uppercase tracking-[0.14em] text-accent">остаток</p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900">{edit.name}</h3>
            <p className="mt-1 text-sm text-neutral-400">сейчас {format_base_qty(as_material(edit), edit.qty)}</p>
            <label className="relative mt-4 block">
              <input
                autoFocus
                inputMode="decimal"
                value={edit_draft}
                onChange={(e) => set_edit_draft(e.target.value)}
                className="w-full border-0 border-b border-neutral-200 bg-transparent py-2 pr-10 text-3xl tabular-nums outline-none focus:border-neutral-900"
              />
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-neutral-400">
                {weigh_unit(weigh_kind_of(as_material(edit)))}
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm text-neutral-500"
                disabled={edit_busy}
                onClick={() => set_edit(null)}
              >
                отмена
              </button>
              <button
                type="submit"
                disabled={parse_qty(edit_draft) == null || edit_busy}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {edit_busy ? 'пишу…' : 'записать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
