'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import InventoryCount from '@/components/admin/finance/inventory-count';
import {
  format_base_qty,
  format_rub,
  type material,
  type material_unit,
  type stock_category,
  type stock_row,
} from '@/lib/finance/model';
import { entered_from_base, parse_qty, to_base_qty, weigh_kind_of, weigh_unit } from '@/lib/finance/weigh';
import type { prep_station_view } from '@/lib/finance/prep-stations';

type stock_money = {
  on_hand: number;
  spent: number;
  realized: number;
  lost: number;
  earned: number | null;
  writeoffs_sum?: number;
  writeoffs_count?: number;
};

type loss_summary = {
  lost: number;
  writeoffs_sum: number;
  writeoffs_count: number;
};

type public_row = {
  id: string;
  name: string;
  category: string;
  unit: material_unit;
  qty: number;
  low: boolean;
  value?: number;
  costPerBase?: number;
};

type public_cat = { id: string; name: string; color: string };

type prep_draft = {
  defaultDryG: string;
  defaultCookedG: string;
  portionG: string;
  dryCostPerKg: string;
};

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

function apply_payload(
  body: {
    must_count?: boolean;
    categories?: public_cat[];
    rows?: public_row[];
    money?: stock_money | null;
    lost?: number;
    writeoffs_sum?: number;
    writeoffs_count?: number;
    prep_stations?: prep_station_view[];
  },
  set: {
    must_count: (v: boolean) => void;
    cats: (v: public_cat[]) => void;
    rows: (v: public_row[]) => void;
    money: (v: stock_money | null) => void;
    losses: (v: loss_summary) => void;
    prep?: (v: prep_station_view[]) => void;
  }
) {
  set.must_count(Boolean(body.must_count));
  if (body.categories) set.cats(body.categories);
  if (body.rows) set.rows(body.rows);
  if (body.money !== undefined) set.money(body.money);
  set.losses({
    lost: Number(body.lost ?? body.money?.lost ?? 0) || 0,
    writeoffs_sum: Number(body.writeoffs_sum ?? body.money?.writeoffs_sum ?? 0) || 0,
    writeoffs_count: Number(body.writeoffs_count ?? body.money?.writeoffs_count ?? 0) || 0,
  });
  if (body.prep_stations && set.prep) set.prep(body.prep_stations);
}

export default function SellerInventory({
  on_nav_depth,
  active = true,
}: {
  on_nav_depth?: (open: boolean) => void;
  active?: boolean;
}) {
  const [rows, set_rows] = useState<public_row[]>([]);
  const [money, set_money] = useState<stock_money | null>(null);
  const [losses, set_losses] = useState<loss_summary>({
    lost: 0,
    writeoffs_sum: 0,
    writeoffs_count: 0,
  });
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
  const [writeoff, set_writeoff] = useState<public_row | null>(null);
  const [writeoff_draft, set_writeoff_draft] = useState('');
  const [writeoff_busy, set_writeoff_busy] = useState(false);
  const [prep_stations, set_prep_stations] = useState<prep_station_view[]>([]);
  const [prep_edit, set_prep_edit] = useState<prep_station_view | null>(null);
  const [prep_draft, set_prep_draft] = useState<prep_draft>({
    defaultDryG: '',
    defaultCookedG: '',
    portionG: '',
    dryCostPerKg: '',
  });
  const [prep_busy, set_prep_busy] = useState(false);

  const setters = useMemo(
    () => ({
      must_count: set_must_count,
      cats: set_cats,
      rows: set_rows,
      money: set_money,
      losses: set_losses,
      prep: set_prep_stations,
    }),
    []
  );

  const load = useCallback(async () => {
    const res = await fetch('/api/seller/stock', { credentials: 'same-origin' });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      must_count?: boolean;
      categories?: public_cat[];
      rows?: public_row[];
      money?: stock_money | null;
      lost?: number;
      writeoffs_sum?: number;
      writeoffs_count?: number;
      prep_stations?: prep_station_view[];
    } | null;
    if (!res.ok) {
      throw new Error(body?.error || 'не удалось загрузить склад');
    }
    apply_payload(body ?? {}, setters);
    set_error('');
  }, [setters]);

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
    on_nav_depth?.(
      active &&
        (count_open ||
          must_count ||
          Boolean(edit) ||
          Boolean(writeoff) ||
          Boolean(prep_edit))
    );
    return () => on_nav_depth?.(false);
  }, [count_open, must_count, edit, writeoff, prep_edit, on_nav_depth, active]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (category !== 'все' && r.category !== category) return false;
      if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [rows, category, query]);

  const count_rows = useMemo(() => rows.map(as_stock_row), [rows]);
  const count_cats = cats as stock_category[];

  const writeoff_preview = useMemo(() => {
    if (!writeoff) return null;
    const entered = parse_qty(writeoff_draft);
    if (entered == null || entered <= 0) return null;
    const base = to_base_qty(as_material(writeoff), entered);
    const cost = Math.round(base * (writeoff.costPerBase ?? 0));
    return { base, cost, entered };
  }, [writeoff, writeoff_draft]);

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
      money?: stock_money | null;
      lost?: number;
      writeoffs_sum?: number;
      writeoffs_count?: number;
    } | null;
    if (!res.ok) throw new Error(body?.error || 'не удалось сохранить');
    apply_payload(body ?? {}, setters);
  }

  async function save_writeoff(row: public_row, entered: number) {
    const qty = to_base_qty(as_material(row), entered);
    const res = await fetch('/api/seller/stock', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'writeoff', materialId: row.id, qty, note: 'списание кассы' }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      must_count?: boolean;
      categories?: public_cat[];
      rows?: public_row[];
      money?: stock_money | null;
      lost?: number;
      writeoffs_sum?: number;
      writeoffs_count?: number;
    } | null;
    if (!res.ok) throw new Error(body?.error || 'не удалось списать');
    apply_payload(body ?? {}, setters);
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
      money?: stock_money | null;
      lost?: number;
      writeoffs_sum?: number;
      writeoffs_count?: number;
    } | null;
    if (!res.ok) throw new Error(body?.error || 'не удалось записать инвентаризацию');
    apply_payload(body ?? {}, setters);
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

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-red-100 bg-red-50/60 px-2 py-2">
          <p className="text-[11px] text-red-500/80">списано</p>
          <p className="text-sm font-semibold tabular-nums text-red-700">
            {format_rub(losses.writeoffs_sum)}
          </p>
          <p className="text-[10px] tabular-nums text-red-400">
            {losses.writeoffs_count} {losses.writeoffs_count === 1 ? 'операция' : 'операций'}
          </p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-2 py-2">
          <p className="text-[11px] text-amber-600/80">потеряно</p>
          <p className="text-sm font-semibold tabular-nums text-amber-800">
            {format_rub(losses.lost)}
          </p>
          <p className="text-[10px] text-amber-500">списания + инвентарь</p>
        </div>
      </div>

      {money ? (
        <div className="grid grid-cols-2 gap-2 text-center">
          {[
            ['на складе', format_rub(money.on_hand)],
            ['потрачено', format_rub(money.spent)],
            ['реализовано', format_rub(money.realized)],
            ['заработано', money.earned == null ? '…' : format_rub(money.earned)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-neutral-200 bg-white px-2 py-2">
              <p className="text-[11px] text-neutral-400">{label}</p>
              <p className="text-sm font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {prep_stations.length ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            варка и заваривание
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            норма выхода и цена сухого — отсюда. сколько стаканов на доске считается по рецептам, а сверка кастрюли уточняет выход.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {prep_stations.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  set_prep_edit(s);
                  set_prep_draft({
                    defaultDryG: String(s.defaultDryG || ''),
                    defaultCookedG: String(s.defaultCookedG || ''),
                    portionG: String(s.portionG || ''),
                    dryCostPerKg: String(s.dryCostPerKg || ''),
                  });
                  set_error('');
                }}
                className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 text-left hover:border-neutral-200"
              >
                <span className="block text-sm font-semibold text-neutral-900">{s.label}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-neutral-500">
                  {s.defaultDryG}→{s.defaultCookedG} г · {s.portionG} г/ст
                  {s.dryCostPerKg ? ` · ${s.dryCostPerKg} ₽/кг` : ''}
                </span>
                <span className="mt-1 block text-xs text-accent">норма</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
              <li
                key={row.id}
                className="flex items-center gap-2 border-t border-neutral-100 px-3 py-2.5 first:border-t-0"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: tag?.color ?? '#8E8E93' }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">{row.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    set_writeoff(row);
                    set_writeoff_draft('');
                    set_error('');
                  }}
                  disabled={row.qty <= 0}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 disabled:opacity-30"
                >
                  списать
                </button>
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
                  {row.value != null ? (
                    <span className="ml-1 text-neutral-400">{format_rub(row.value)}</span>
                  ) : null}
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

      {active && prep_edit && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={() => {
            if (prep_busy) return;
            set_prep_edit(null);
          }}
        >
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (prep_busy || !prep_edit) return;
              set_prep_busy(true);
              fetch('/api/seller/prep', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  kind: 'config',
                  stationId: prep_edit.id,
                  defaultDryG: Number(prep_draft.defaultDryG),
                  defaultCookedG: Number(prep_draft.defaultCookedG),
                  portionG: Number(prep_draft.portionG),
                  dryCostPerKg:
                    prep_draft.dryCostPerKg === ''
                      ? undefined
                      : Number(prep_draft.dryCostPerKg),
                }),
              })
                .then(async (res) => {
                  const body = (await res.json().catch(() => null)) as {
                    error?: string;
                    stations?: prep_station_view[];
                  } | null;
                  if (!res.ok) throw new Error(body?.error || 'не удалось сохранить');
                  if (body?.stations) set_prep_stations(body.stations);
                  set_prep_edit(null);
                })
                .catch((err) => set_error(err instanceof Error ? err.message : 'ошибка'))
                .finally(() => set_prep_busy(false));
            }}
          >
            <p className="text-xs uppercase tracking-[0.14em] text-accent">норма варки</p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900">{prep_edit.label}</h3>
            <p className="mt-1 text-sm text-neutral-400">
              от этих цифр касса сама считает выход и себестоимость готового
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">сухой, г</span>
                <input
                  inputMode="numeric"
                  value={prep_draft.defaultDryG}
                  onChange={(e) => set_prep_draft((d) => ({ ...d, defaultDryG: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-base tabular-nums outline-none focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">готовый, г</span>
                <input
                  inputMode="numeric"
                  value={prep_draft.defaultCookedG}
                  onChange={(e) =>
                    set_prep_draft((d) => ({ ...d, defaultCookedG: e.target.value }))
                  }
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-base tabular-nums outline-none focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">г на стакан</span>
                <input
                  inputMode="numeric"
                  value={prep_draft.portionG}
                  onChange={(e) => set_prep_draft((d) => ({ ...d, portionG: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-base tabular-nums outline-none focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">сухой ₽/кг</span>
                <input
                  inputMode="decimal"
                  value={prep_draft.dryCostPerKg}
                  onChange={(e) => set_prep_draft((d) => ({ ...d, dryCostPerKg: e.target.value }))}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-base tabular-nums outline-none focus:border-neutral-900"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm text-neutral-500"
                disabled={prep_busy}
                onClick={() => set_prep_edit(null)}
              >
                отмена
              </button>
              <button
                type="submit"
                disabled={prep_busy}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {prep_busy ? 'пишу…' : 'сохранить'}
              </button>
            </div>
          </form>
        </div>
      )}

      {active && writeoff && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={() => {
            if (writeoff_busy) return;
            set_writeoff(null);
          }}
        >
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const n = parse_qty(writeoff_draft);
              if (n == null || n <= 0 || writeoff_busy) return;
              set_writeoff_busy(true);
              save_writeoff(writeoff, n)
                .then(() => set_writeoff(null))
                .catch((err) => set_error(err instanceof Error ? err.message : 'ошибка'))
                .finally(() => set_writeoff_busy(false));
            }}
          >
            <p className="text-xs uppercase tracking-[0.14em] text-red-500">списание</p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-900">{writeoff.name}</h3>
            <p className="mt-1 text-sm text-neutral-400">
              на складе {format_base_qty(as_material(writeoff), writeoff.qty)}
              {writeoff.costPerBase
                ? ` · ${format_rub(writeoff.costPerBase * (writeoff.unit === 'kg' ? 1000 : 1))}${
                    writeoff.unit === 'kg' || writeoff.unit === 'g' ? '/кг' : ''
                  }`
                : ''}
            </p>
            <label className="relative mt-4 block">
              <input
                autoFocus
                inputMode="decimal"
                value={writeoff_draft}
                onChange={(e) => set_writeoff_draft(e.target.value)}
                placeholder="0"
                className="w-full border-0 border-b border-neutral-200 bg-transparent py-2 pr-10 text-3xl tabular-nums outline-none focus:border-red-500"
              />
              <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-neutral-400">
                {weigh_unit(weigh_kind_of(as_material(writeoff)))}
              </span>
            </label>
            <p className="mt-3 text-center text-sm text-neutral-600">
              {writeoff_preview ? (
                <>
                  спишется{' '}
                  <span className="font-semibold tabular-nums">
                    {format_base_qty(as_material(writeoff), writeoff_preview.base)}
                  </span>
                  {' · '}
                  <span className="font-semibold tabular-nums text-red-600">
                    ≈ {format_rub(writeoff_preview.cost)}
                  </span>
                </>
              ) : (
                <span className="text-neutral-400">укажите сколько списать</span>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm text-neutral-500"
                disabled={writeoff_busy}
                onClick={() => set_writeoff(null)}
              >
                отмена
              </button>
              <button
                type="submit"
                disabled={
                  !writeoff_preview ||
                  writeoff_preview.base > writeoff.qty + 0.5 ||
                  writeoff_busy
                }
                className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {writeoff_busy ? 'пишу…' : 'списать'}
              </button>
            </div>
          </form>
        </div>
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
            <p className="mt-1 text-sm text-neutral-400">
              сейчас {format_base_qty(as_material(edit), edit.qty)}
            </p>
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
