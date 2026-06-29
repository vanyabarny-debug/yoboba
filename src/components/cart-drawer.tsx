'use client';

import { createElement } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import {
  calc_order_bonus,
  format_cart_summary,
  format_positions,
  format_price,
  get_upsell_items,
  line_volume_label,
} from '@/lib/cart-summary';
import { default_store_address } from '@/lib/location';

export type cart_line = {
  item: menu_item;
  quantity: number;
};

type props = {
  open: boolean;
  lines: cart_line[];
  all_items: menu_item[];
  on_close: () => void;
  on_update_qty: (menu_id: string, quantity: number) => void;
  on_remove: (menu_id: string) => void;
  on_add?: (item: menu_item, qty: number) => void;
  on_open_item?: (item: menu_item) => void;
  on_edit?: (item: menu_item) => void;
  on_checkout?: () => void;
};

function tapioca_info() {
  return (
    <span className="group relative inline-flex align-middle">
      <span className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-neutral-300 text-[9px] font-bold text-white">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-60 rounded-xl bg-neutral-900 px-3 py-2.5 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        Тапиока — классическая основа бабл ти. В порцию кладём около 60 г — это
        примерно 50 шариков варёной тапиоки. Накопите столько шариков и получите
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
}: props) {
  if (!open) return null;

  const total = lines.reduce((s, l) => s + l.item.price * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const bonus_points = calc_order_bonus(total);
  const cart_ids = new Set(lines.map((l) => l.item.id));
  const { items: upsell_items, suggest_snacks } = get_upsell_items(all_items, cart_ids, lines);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        onClick={on_close}
      />
      <div className="relative w-full md:max-w-md">
        <button
          type="button"
          onClick={on_close}
          aria-label="закрыть"
          className="absolute top-0 right-2 sm:-right-12 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:bg-neutral-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="bg-[#f3f4f6] shadow-soft max-h-[88vh] flex flex-col overflow-hidden rounded-t-2xl md:rounded-card">
        <div className="bg-[#f3f4f6] px-5 pt-5 pb-4">
          <h3 className="text-2xl font-bold text-neutral-900">
            {count > 0 ? format_cart_summary(count, total) : 'корзина'}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {lines.length === 0 ? (
            <p className="bg-white px-5 py-10 text-sm text-neutral-400 text-center">корзина пуста</p>
          ) : (
            <>
              {lines.map((line) => {
                const volume = line_volume_label(line.item.category);
                return (
                  <div key={line.item.id} className="bg-white px-5 py-4">
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
                            onClick={() => on_remove(line.item.id)}
                            aria-label="удалить"
                            className="text-neutral-900 text-xl leading-none hover:text-neutral-600 shrink-0"
                          >
                            ×
                          </button>
                        </div>
                        <p className="text-sm text-neutral-500 mt-0.5">
                          {volume ?? line.item.category}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-[#f0f0f2] mt-3 pt-3 flex items-center justify-between gap-3">
                      <p className="text-[17px] font-bold font-mono tabular-nums text-neutral-900">
                        {format_price(line.item.price * line.quantity)} ₽
                      </p>
                      <div className="flex items-center gap-3">
                        {on_edit && (
                          <button
                            type="button"
                            onClick={() => on_edit(line.item)}
                            className="text-sm font-semibold text-accent hover:underline"
                          >
                            Изменить
                          </button>
                        )}
                        <div className="flex items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
                          <button
                            type="button"
                            onClick={() =>
                              on_update_qty(line.item.id, Math.max(1, line.quantity - 1))
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-neutral-700"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => on_update_qty(line.item.id, line.quantity + 1)}
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
                <div className="px-5 py-4 border-b border-[#f0f0f2]">
                  <input
                    type="text"
                    placeholder="Промокод"
                    className="w-full bg-transparent text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                </div>
                <div className="px-5 py-4 space-y-2.5 text-[15px]">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">
                      Начислим тапиоку{tapioca_info()}
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
            </>
          )}
        </div>

        {lines.length > 0 && (
          <div className="p-4 bg-white">
            <button
              type="button"
              onClick={on_checkout}
              className="relative w-full rounded-pill bg-accent text-white py-4 text-base font-semibold hover:opacity-95 transition-opacity"
            >
              К оформлению заказа
              <svg
                className="absolute right-5 top-1/2 -translate-y-1/2"
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
        )}
        </div>
      </div>
    </div>
  );
}
