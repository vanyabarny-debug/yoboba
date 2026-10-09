'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { menu_item, order_combo_component } from '@/lib/types';
import menu_image from '@/components/menu-image';
import {
  build_combo_components,
  combo_selectable_drinks,
  format_combo_picks,
  get_combo_config,
} from '@/lib/combo';
import { FLOATING_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';

type props = {
  combo: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  initial_picks?: menu_item[];
  qty?: number;
  on_close: () => void;
  on_confirm: (payload: {
    combo: menu_item;
    qty: number;
    combo_picks: string[];
    combo_components: order_combo_component[];
  }) => void;
};

export default function seller_combo_sheet({
  combo,
  all_items,
  open,
  initial_picks,
  qty: initial_qty = 1,
  on_close,
  on_confirm,
}: props) {
  const cfg = get_combo_config(combo);
  const slots = cfg?.drink_count ?? 0;
  const allow_duplicates = cfg?.allow_duplicates !== false;
  const drinks = useMemo(() => combo_selectable_drinks(all_items, combo), [all_items, combo]);
  const includes = useMemo(() => {
    const by_id = new Map(all_items.map((m) => [m.id, m]));
    return (cfg?.includes ?? [])
      .map((row) => {
        const item = by_id.get(row.menu_id);
        return item ? { item, qty: row.qty } : null;
      })
      .filter(Boolean) as { item: menu_item; qty: number }[];
  }, [all_items, cfg?.includes]);

  const [picks, set_picks] = useState<menu_item[]>([]);
  const [qty, set_qty] = useState(1);

  useEffect(() => {
    if (!open || !combo) return;
    set_picks(initial_picks?.slice(0, slots) ?? []);
    set_qty(Math.max(1, initial_qty));
  }, [open, combo?.id, slots, initial_picks, initial_qty]);

  if (!open || !combo || slots <= 0) return null;

  const filled = picks.length;
  const ready = filled >= slots;
  const remaining = Math.max(0, slots - filled);

  function add_drink(item: menu_item) {
    set_picks((prev) => {
      if (prev.length >= slots) return prev;
      if (!allow_duplicates && prev.some((p) => p.id === item.id)) return prev;
      return [...prev, item];
    });
  }

  function remove_at(index: number) {
    set_picks((prev) => prev.filter((_, i) => i !== index));
  }

  function confirm() {
    if (!ready || !combo) return;
    const drink_picks = picks.slice(0, slots);
    on_confirm({
      combo,
      qty,
      combo_picks: drink_picks.map((p) => p.name),
      combo_components: build_combo_components(combo, drink_picks, all_items),
    });
    on_close();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="закрыть" className="absolute inset-0" onClick={on_close} />
      <div className="relative flex h-[min(92dvh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft sm:rounded-3xl">
        <button type="button" aria-label="закрыть" onClick={on_close} className={FLOATING_CLOSE_BTN_CLASS}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="border-b border-neutral-100 px-5 py-4 pr-14">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">комбо</p>
          <h3 className="mt-0.5 text-xl font-bold text-neutral-900">{combo.name}</h3>
          <p className="mt-1 text-sm text-neutral-500">
            укажите {slots}{' '}
            {slots === 1 ? 'напиток' : slots < 5 ? 'напитка' : 'напитков'}
            {cfg?.volume_ml ? ` ${cfg.volume_ml} мл` : ''} · {filled}/{slots}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-900">
            {combo.price} ₽ · себестоимость по выбранным напиткам
          </p>
        </div>

        {picks.length > 0 ? (
          <div className="border-b border-neutral-100 px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {picks.map((pick, index) => (
                <button
                  key={`${pick.id}-${index}`}
                  type="button"
                  onClick={() => remove_at(index)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/10 py-1.5 pl-1.5 pr-2.5 text-left text-xs font-semibold text-neutral-800"
                >
                  <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-white">
                    {createElement(menu_image, {
                      item: pick,
                      className: 'h-full w-full',
                      variant: 'thumb',
                      fit: 'contain',
                    })}
                  </span>
                  <span className="truncate">{pick.name}</span>
                  <span className="text-neutral-400">×</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              нажмите чтобы убрать · {format_combo_picks(picks.map((p) => p.name))}
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {includes.length ? (
            <div className="mb-4 rounded-2xl bg-neutral-50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">уже в комплекте</p>
              <ul className="mt-1.5 space-y-1">
                {includes.map(({ item, qty: n }) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm text-neutral-800">
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white">
                      {createElement(menu_image, {
                        item,
                        className: 'h-full w-full',
                        variant: 'thumb',
                        fit: 'contain',
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-neutral-400">×{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {drinks.map((item) => {
              const already = !allow_duplicates && picks.some((p) => p.id === item.id);
              const disabled = ready || already;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => add_drink(item)}
                  className={`flex min-w-0 flex-col items-center rounded-2xl p-2 text-center ${
                    disabled ? 'opacity-40' : 'hover:bg-neutral-50 active:bg-neutral-100'
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden rounded-xl bg-white">
                    {createElement(menu_image, {
                      item,
                      className: 'h-full w-full',
                      variant: 'card',
                      fit: 'contain',
                    })}
                  </div>
                  <p className="mt-1.5 line-clamp-2 w-full text-[11px] font-bold leading-tight text-neutral-900">
                    {item.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-100 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-neutral-500">количество комбо</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-lg"
                onClick={() => set_qty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="w-8 text-center text-base font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-lg"
                onClick={() => set_qty((q) => q + 1)}
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            disabled={!ready}
            onClick={confirm}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-base font-semibold text-white disabled:opacity-40"
          >
            {ready ? (
              <>в заказ · {combo.price * qty} ₽</>
            ) : (
              <>ещё {remaining}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
