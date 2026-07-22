'use client';

import { createElement, useEffect, useRef, useState } from 'react';
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
  calc_order_bonus,
  format_cart_summary,
  format_positions,
  format_price,
  get_upsell_items,
} from '@/lib/cart-summary';
import { get_topping_name, get_topping_portion_price_value } from '@/lib/product-details';
import { default_store_address } from '@/lib/location';

export type cart_line = {
  item: menu_item;
  quantity: number;
  /** уникальный ключ позиции (чтобы правки не склеивались) */
  key?: string;
  volume?: '450' | '650';
  /** порций топпинга на 1 шт */
  topping?: number;
};

export function cart_line_unit_price(line: cart_line): number {
  if (line.volume == null && (line.topping == null || line.topping === 0)) {
    return line.item.price;
  }
  const volume_add = line.volume === '650' ? 50 : 0;
  const topping = line.topping ?? 0;
  return Math.max(0, line.item.price + volume_add + topping * get_topping_portion_price_value());
}

export function cart_line_key(line: cart_line, index: number) {
  return line.key || `${line.item.id}-${index}`;
}

type props = {
  open: boolean;
  lines: cart_line[];
  all_items: menu_item[];
  on_close: () => void;
  on_update_qty: (line_key: string, quantity: number) => void;
  on_remove: (line_key: string) => void;
  on_add?: (item: menu_item, qty: number) => void;
  on_open_item?: (item: menu_item) => void;
  on_edit?: (line: cart_line, line_key: string) => void;
  on_checkout?: () => void;
  on_clear?: () => void;
};

function tapioca_info() {
  return (
    <span className="group relative inline-flex align-middle">
      <span className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-[#0039A6] text-[9px] font-bold text-white font-mono">
        t
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-xl bg-neutral-900 px-3 py-2.5 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        Тапиока — классическая основа бабл ти. В порцию кладём около 60 г — это
        примерно 50 шариков варёной тапиоки. Накопите 50 тапикоинов и получите
        напиток бесплатно.
      </span>
    </span>
  );
}

export default function cart_drawer({
  open,
  lines,
  all_items,
  on_close,
  on_update_qty,
  on_remove,
  on_add,
  on_open_item,
  on_edit,
  on_checkout,
  on_clear,
}: props) {
  const [sheet_visible, set_sheet_visible] = useState(false);
  const [sheet_open, set_sheet_open] = useState(false);
  const body_ref = useRef<HTMLDivElement>(null);

  const { sheet_props, backdrop_style } = use_sheet_swipe({
    active: sheet_open,
    on_dismiss: on_close,
    get_scroll_top: () => body_ref.current?.scrollTop ?? 0,
  });

  useEffect(() => {
    if (!open) return;
    set_sheet_visible(true);
    set_sheet_open(false);
    const timer = window.setTimeout(() => set_sheet_open(true), SHEET_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    set_sheet_open(false);
  }, [open]);

  useEffect(() => {
    if (open || !sheet_visible) return;
    const timer = window.setTimeout(() => set_sheet_visible(false), SHEET_ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [open, sheet_visible]);

  useEffect(() => {
    if (!sheet_visible && !open) return;
    const prev_overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev_overflow;
    };
  }, [sheet_visible, open]);

  if (!sheet_visible && !open) return null;

  const total = lines.reduce((s, l) => s + cart_line_unit_price(l) * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const bonus_points = calc_order_bonus(total);
  const cart_ids = new Set(lines.map((l) => l.item.id));
  const { items: upsell_items, suggest_snacks } = get_upsell_items(all_items, cart_ids, lines);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className={`product-panel-backdrop absolute inset-0 bg-black/45 backdrop-blur-[3px] ${sheet_open ? 'is-visible' : ''}`}
        style={backdrop_style}
        onClick={on_close}
      />
      <div className="relative flex h-full w-full sm:mx-4 sm:block sm:h-auto sm:max-w-md">
        <button
          type="button"
          onClick={on_close}
          aria-label="закрыть"
          className={DRAWER_CLOSE_BTN_CLASS}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <div
          className={`product-panel-sheet relative flex h-full max-h-none flex-col overflow-hidden bg-[#f3f4f6] shadow-soft sm:max-h-[88vh] sm:rounded-card ${sheet_open ? 'is-visible' : ''}`}
          {...sheet_props}
        >
        <div
          className={`bg-[#f3f4f6] px-5 pt-[max(1.25rem,var(--safe-top))] pb-4 sm:pt-5 ${lines.length > 0 ? 'hidden sm:block' : ''}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-2xl font-bold text-neutral-900">
              {count > 0 ? format_cart_summary(count, total) : 'корзина'}
            </h3>
            {lines.length === 0 && (
              <button
                type="button"
                onClick={on_close}
                aria-label="закрыть"
                className={`${DRAWER_INLINE_CLOSE_BTN_CLASS} sm:hidden`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {lines.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-[#f3f4f6] px-5 pt-[max(1.25rem,var(--safe-top))] pb-3 sm:hidden">
            {on_clear ? (
              <button
                type="button"
                onClick={on_clear}
                className="text-sm font-semibold text-accent-pink hover:opacity-80 transition-opacity"
              >
                очистить корзину
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={on_close}
              aria-label="закрыть"
              className={DRAWER_INLINE_CLOSE_BTN_CLASS}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div ref={body_ref} className="product-panel-body flex-1 overflow-y-auto pb-[calc(5rem+var(--safe-bottom))] sm:pb-0">
          {lines.length === 0 ? (
            <p className="bg-white px-5 py-10 text-sm text-neutral-400 text-center">корзина пуста</p>
          ) : (
            <>
              <div className="space-y-2">
              {lines.map((line, index) => {
                const key = cart_line_key(line, index);
                const unit = cart_line_unit_price(line);
                const volume_label = line.volume ? `${line.volume} мл` : null;
                const topping_label =
                  (line.topping ?? 0) > 0
                    ? `+${line.topping}× ${get_topping_name(line.item)}`
                    : null;
                const meta = [volume_label, topping_label, line.item.category]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <div key={key} className="bg-white px-5 py-4">
                    <div className="flex gap-3">
                      {createElement(menu_image, {
                        item: line.item,
                        className: 'w-16 h-16 rounded-xl flex-shrink-0',
                        variant: 'thumb',
                      })}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[17px] font-bold leading-snug text-neutral-900">
                            {line.item.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => on_remove(key)}
                            aria-label="удалить"
                            className="text-neutral-900 text-xl leading-none hover:text-neutral-600 shrink-0"
                          >
                            ×
                          </button>
                        </div>
                        <p className="text-sm text-neutral-500 mt-0.5">{meta}</p>
                      </div>
                    </div>

                    <div className="border-t border-[#f0f0f2] mt-3 pt-3 flex items-center justify-between gap-3">
                      <p className="text-[17px] font-bold font-mono tabular-nums text-neutral-900">
                        {format_price(unit * line.quantity)} ₽
                      </p>
                      <div className="flex items-center gap-3">
                        {on_edit && !line.item.id.startsWith('topping-') && (
                          <button
                            type="button"
                            onClick={() => on_edit(line, key)}
                            className="text-sm font-semibold text-accent hover:underline"
                          >
                            Изменить
                          </button>
                        )}
                        <div className="flex items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
                          <button
                            type="button"
                            disabled={line.quantity <= 1}
                            onClick={() => on_update_qty(key, Math.max(1, line.quantity - 1))}
                            aria-label="уменьшить количество"
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-neutral-700 disabled:text-neutral-400/70"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => on_update_qty(key, line.quantity + 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-neutral-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {upsell_items.length > 0 && on_open_item && (
                <div className="px-5 py-4">
                  <p className="text-[17px] font-bold text-neutral-900 mb-3">
                    {suggest_snacks ? 'Добавить закуску?' : 'Добавить к заказу?'}
                  </p>
                  <div className="-mx-5 px-5 overflow-x-auto stories-scroll">
                    <div className="flex w-max gap-2.5">
                      {upsell_items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => on_open_item(item)}
                          className="flex w-56 flex-shrink-0 items-center gap-3 rounded-2xl border border-[#ececef] bg-white p-2.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all hover:border-neutral-300"
                        >
                          {createElement(menu_image, {
                            item,
                            className: 'w-20 h-20 rounded-xl flex-shrink-0',
                            variant: 'thumb',
                          })}
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug text-neutral-900 line-clamp-2">
                              {item.name}
                            </p>
                            <p className="mt-1 text-sm font-semibold font-mono tabular-nums text-neutral-900">
                              от {format_price(item.price)} ₽
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white">
                <p className="px-5 pt-4 pb-2 text-[17px] font-bold text-neutral-900">Детали</p>
                <div className="px-5 py-4 border-t border-b border-[#f0f0f2]">
                  <input
                    type="text"
                    placeholder="Промокод"
                    className="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                </div>
                <div className="px-5 py-4 space-y-2.5 text-[15px]">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">
                      Начислим тапикоины{tapioca_info()}
                    </span>
                    <span className="font-semibold font-mono tabular-nums text-neutral-900">+{bonus_points}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-neutral-500">Где забрать заказ</span>
                    <span className="font-semibold text-neutral-900 text-right">
                      {default_store_address}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">{format_positions(count)}</span>
                    <span className="font-semibold font-mono tabular-nums text-neutral-900">{format_price(total)} ₽</span>
                  </div>
                </div>
              </div>
              </div>
            </>
          )}
        </div>

        {lines.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#f0f0f2] bg-white sm:static sm:shrink-0">
            <div className="flex justify-center px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))] sm:px-4 sm:pt-4 sm:pb-4">
              <button
                type="button"
                onClick={on_checkout}
                className="inline-flex w-auto max-w-full items-center justify-center rounded-pill bg-accent px-6 py-4 text-base font-semibold text-accent-foreground hover:opacity-95 transition-opacity sm:relative sm:w-full"
              >
                <span className="sm:hidden">к оформлению на {format_price(total)} ₽</span>
                <span className="hidden sm:inline">К оформлению заказа</span>
                <svg
                  className="absolute right-5 top-1/2 -translate-y-1/2 hidden sm:block"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
