'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import {
  DRAWER_CLOSE_BTN_CLASS,
  DRAWER_INLINE_CLOSE_BTN_CLASS,
  SHEET_ANIM_MS,
  SHEET_OPEN_DELAY_MS,
} from '@/lib/drawer-ui';
import { use_sheet_swipe } from '@/lib/use-sheet-swipe';
import {
  combo_selectable_drinks,
  format_combo_picks,
  get_combo_config,
} from '@/lib/combo';
import { student_line_price } from '@/lib/student-discount';

type props = {
  combo: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  on_close: () => void;
  on_confirm: (combo: menu_item, picks: menu_item[]) => void;
  initial_picks?: menu_item[];
  student_verified?: boolean;
};

export default function combo_builder({
  combo,
  all_items,
  open,
  on_close,
  on_confirm,
  initial_picks,
  student_verified = false,
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
  const combo_full =
    all_items.find((m) => m.id === combo?.id)?.price ?? combo?.price ?? 0;
  const combo_price = student_line_price(
    combo_full,
    { category: combo?.category, id: combo?.id },
    student_verified
  );
  const [picks, set_picks] = useState<menu_item[]>([]);
  const [sheet_visible, set_sheet_visible] = useState(false);
  const [sheet_open, set_sheet_open] = useState(false);

  useEffect(() => {
    if (!open || !combo) {
      set_sheet_open(false);
      const t = window.setTimeout(() => set_sheet_visible(false), SHEET_ANIM_MS);
      return () => window.clearTimeout(t);
    }
    set_sheet_visible(true);
    set_picks(initial_picks?.slice(0, slots) ?? []);
    const t = window.setTimeout(() => set_sheet_open(true), SHEET_OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [open, combo?.id, slots, initial_picks]);

  const { sheet_props, backdrop_style } = use_sheet_swipe({
    active: sheet_open,
    on_dismiss: on_close,
    vertical_only: true,
  });

  if ((!sheet_visible && !open) || !combo || slots <= 0) return null;

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
    const fixed = includes.flatMap(({ item, qty }) => Array.from({ length: qty }, () => item));
    on_confirm(combo, [...picks.slice(0, slots), ...fixed]);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className={`product-panel-backdrop absolute inset-0 bg-black/45 backdrop-blur-[3px] ${sheet_open ? 'is-visible' : ''}`}
        style={backdrop_style}
        onClick={on_close}
      />

      <div className="relative flex h-full w-full max-w-[560px] sm:mx-4 sm:block sm:h-auto">
        <button
          type="button"
          aria-label="закрыть"
          onClick={on_close}
          className={DRAWER_CLOSE_BTN_CLASS}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div
          className={`product-panel product-panel-sheet relative flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:max-h-[min(94vh,820px)] sm:rounded-[28px] ${sheet_open ? 'is-visible' : ''}`}
          {...sheet_props}
        >
          <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
            <div className="min-w-0 pr-10 sm:pr-0">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                конструктор комбо
              </p>
              <h3 className="mt-0.5 text-xl font-bold text-neutral-900 sm:text-2xl">
                {combo.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                выбери {slots}{' '}
                {slots === 1 ? 'напиток' : slots < 5 ? 'напитка' : 'напитков'}
                {cfg?.volume_ml ? ` ${cfg.volume_ml} мл` : ''} · {filled}/{slots}
              </p>
            </div>
            <button
              type="button"
              aria-label="закрыть"
              onClick={on_close}
              className={`absolute top-[max(0.75rem,var(--safe-top))] right-3 z-30 sm:hidden ${DRAWER_INLINE_CLOSE_BTN_CLASS}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {picks.length > 0 && (
            <div className="border-b border-neutral-100 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                {picks.map((pick, index) => (
                  <button
                    key={`${pick.id}-${index}`}
                    type="button"
                    onClick={() => remove_at(index)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent/10 py-1.5 pl-1.5 pr-2.5 text-left text-xs font-semibold text-neutral-800"
                    aria-label={`убрать ${pick.name}`}
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
                нажми на напиток, чтобы убрать · {format_combo_picks(picks.map((p) => p.name))}
              </p>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            {includes.length ? (
              <div className="mb-4 rounded-2xl bg-neutral-50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  уже в комплекте
                </p>
                <ul className="mt-1.5 space-y-1">
                  {includes.map(({ item, qty }) => (
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
                      <span className="text-xs text-neutral-400">×{qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
              {drinks.map((item) => {
                const already = !allow_duplicates && picks.some((p) => p.id === item.id);
                const disabled = ready || already;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => add_drink(item)}
                    className={`flex min-w-0 flex-col items-center rounded-2xl p-2 text-center transition-colors ${
                      disabled
                        ? 'opacity-40'
                        : 'hover:bg-accent/[0.06] active:bg-accent/10'
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
                    <p className="mt-1.5 line-clamp-2 w-full text-[11px] font-bold leading-tight text-neutral-900 sm:text-xs">
                      {item.name}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 border-t border-neutral-100 px-5 py-4 pb-[calc(1rem+var(--safe-bottom))] sm:px-6">
            <button
              type="button"
              disabled={!ready}
              onClick={confirm}
              className="flex w-full items-center justify-center gap-2 rounded-pill bg-accent py-3.5 text-base font-semibold text-accent-foreground transition-opacity disabled:opacity-40"
            >
              {ready ? (
                <>
                  в корзину · {combo_price} ₽
                </>
              ) : (
                <>ещё {remaining}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
