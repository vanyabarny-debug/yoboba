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
  get_combo_drink_count,
} from '@/lib/combo';

type props = {
  combo: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  on_close: () => void;
  on_confirm: (combo: menu_item, picks: menu_item[]) => void;
  initial_picks?: menu_item[];
};

export default function combo_builder({
  combo,
  all_items,
  open,
  on_close,
  on_confirm,
  initial_picks,
}: props) {
  const slots = get_combo_drink_count(combo) ?? 0;
  const drinks = useMemo(() => combo_selectable_drinks(all_items), [all_items]);
  const combo_price =
    all_items.find((m) => m.id === combo?.id)?.price ?? combo?.price ?? 0;
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
      return [...prev, item];
    });
  }

  function remove_at(index: number) {
    set_picks((prev) => prev.filter((_, i) => i !== index));
  }

  function confirm() {
    if (!ready || !combo) return;
    on_confirm(combo, picks.slice(0, slots));
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
                {slots === 1 ? 'напиток' : slots < 5 ? 'напитка' : 'напитков'} · {filled}/{slots}
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
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f3f4f6] py-1.5 pl-1.5 pr-2.5 text-left text-xs font-semibold text-neutral-800"
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
              {drinks.map((item) => {
                const disabled = ready;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => add_drink(item)}
                    className={`flex min-w-0 flex-col items-center rounded-2xl p-2 text-center transition-colors ${
                      disabled
                        ? 'opacity-40'
                        : 'hover:bg-neutral-50 active:bg-neutral-100'
                    }`}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-xl bg-[#f3f4f6]">
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
