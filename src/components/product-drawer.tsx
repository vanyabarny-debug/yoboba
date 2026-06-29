'use client';

import { createElement, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { menu_item } from '@/lib/types';
import { create_client } from '@/lib/supabase/client';
import menu_image from '@/components/menu-image';
import {
  get_composition,
  get_description,
  get_nutrition,
  get_topping_name,
  get_topping_portion_price_value,
  topping_as_menu_item,
} from '@/lib/product-details';
import { subscribe_site_content_store } from '@/lib/site-content-store';

type props = {
  item: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  on_close: () => void;
  on_add: (item: menu_item, qty: number) => void;
  return_to_cart?: boolean;
  on_return_to_cart?: () => void;
};

const volumes = [
  { id: '450', label: '450 мл', ml: 450, add: 0 },
  { id: '650', label: '650 мл', ml: 650, add: 50 },
] as const;

type card_state = {
  qty: number;
  volume: (typeof volumes)[number]['id'];
  topping: number;
  details_open: boolean;
};

type history_entry = {
  item: menu_item;
  state: card_state;
};

function default_card_state(): card_state {
  return { qty: 1, volume: '450', topping: 0, details_open: false };
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] font-semibold tracking-tight text-neutral-900">{children}</p>
  );
}

export default function product_drawer({
  item,
  all_items,
  open,
  on_close,
  on_add,
  return_to_cart = false,
  on_return_to_cart,
}: props) {
  const [qty, set_qty] = useState(1);
  const [volume, set_volume] = useState<(typeof volumes)[number]['id']>('450');
  const [topping, set_topping] = useState(0);
  const [details_open, set_details_open] = useState(false);
  const [nav_item, set_nav_item] = useState<menu_item | null>(null);
  const [history, set_history] = useState<history_entry[]>([]);
  const [recommendations, set_recommendations] = useState<menu_item[]>([]);
  const [meta_tick, set_meta_tick] = useState(0);

  const active_item = nav_item ?? item;
  const can_go_back = history.length > 0;
  const show_back_arrow = can_go_back || return_to_cart;
  const show_recommendations = !can_go_back && !return_to_cart;

  function apply_card_state(state: card_state) {
    set_qty(state.qty);
    set_volume(state.volume);
    set_topping(state.topping);
    set_details_open(state.details_open);
  }

  function snapshot_card_state(): card_state {
    return { qty, volume, topping, details_open };
  }

  useEffect(() => {
    function reload_meta() {
      set_meta_tick((t) => t + 1);
    }
    reload_meta();
    return subscribe_site_content_store(reload_meta);
  }, []);

  useEffect(() => {
    set_nav_item(null);
    set_history([]);
    apply_card_state(default_card_state());
  }, [item?.id]);

  useEffect(() => {
    const current = active_item;
    if (!current || !show_recommendations) {
      set_recommendations([]);
      return;
    }

    async function load_recs(active: menu_item) {
      const rec_ids = active.recommendations ?? [];
      const snack_extras = all_items
        .filter((m) => m.is_available && m.category === 'закуски')
        .slice(0, 2)
        .map((m) => m.id);

      const excluded = new Set<string>();
      if (item) excluded.add(item.id);
      history.forEach((entry) => excluded.add(entry.item.id));

      const ids = [...new Set([...rec_ids, ...snack_extras])].filter(
        (id) => !excluded.has(id)
      );
      if (ids.length === 0) {
        set_recommendations([]);
        return;
      }

      const local = all_items.filter((m) => ids.includes(m.id) && m.is_available);
      if (local.length > 0) {
        set_recommendations(local);
        return;
      }

      const supabase = create_client();
      const { data } = await supabase
        .from('menu')
        .select('*')
        .in('id', ids)
        .eq('is_available', true);
      set_recommendations((data as menu_item[]) || []);
    }
    load_recs(current);
  }, [active_item?.id, all_items, item, show_recommendations, history]);

  const volume_ml = volumes.find((v) => v.id === volume)?.ml ?? 450;
  const topping_max = Math.max(4, Math.round(volume_ml / 60));

  const topping_price = get_topping_portion_price_value();

  const unit_price = useMemo(() => {
    if (!active_item) return 0;
    const volume_add = volumes.find((v) => v.id === volume)?.add ?? 0;
    return Math.max(0, active_item.price + volume_add + topping * topping_price);
  }, [active_item, volume, topping, topping_price, meta_tick]);

  const total_price = unit_price * qty;

  const composition = useMemo(
    () => (active_item ? get_composition(active_item) : []),
    [active_item, meta_tick]
  );
  const description = useMemo(
    () => (active_item ? get_description(active_item) : ''),
    [active_item, meta_tick]
  );
  const nutrition = useMemo(
    () => (active_item ? get_nutrition(active_item, volume_ml, topping) : null),
    [active_item, volume_ml, topping, meta_tick]
  );
  const topping_name = active_item ? get_topping_name(active_item) : '';

  function finish_view() {
    if (return_to_cart) {
      on_return_to_cart?.();
      return;
    }
    on_close();
  }

  function pop_card() {
    const parent = history[history.length - 1];
    if (!parent) return;

    const next_history = history.slice(0, -1);
    set_history(next_history);
    set_nav_item(next_history.length > 0 ? parent.item : null);
    apply_card_state(parent.state);
  }

  function handle_back() {
    if (can_go_back) {
      pop_card();
      return;
    }
    finish_view();
  }

  function open_recommendation(rec: menu_item) {
    if (active_item) {
      set_history((prev) => [
        ...prev,
        { item: active_item, state: snapshot_card_state() },
      ]);
    }
    apply_card_state(default_card_state());
    set_nav_item(rec);
  }

  function handle_add_to_cart() {
    if (!active_item) return;

    on_add(active_item, qty);

    if (topping > 0) {
      on_add(topping_as_menu_item(active_item), topping * qty);
    }

    if (can_go_back) {
      pop_card();
      return;
    }

    finish_view();
  }

  if (!open || !item || !active_item || !nutrition) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        onClick={handle_back}
      />

      <div className="relative w-full max-w-[940px] sm:mx-4">
        <button
          type="button"
          aria-label={show_back_arrow ? 'назад' : 'закрыть'}
          onClick={handle_back}
          className="absolute top-0 right-2 sm:-right-12 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:bg-neutral-50 transition-colors"
        >
          {show_back_arrow ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        <div className="product-panel relative flex h-[min(92vh,640px)] max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:h-[min(88vh,620px)] sm:max-h-[88vh] sm:flex-row sm:rounded-[28px]">
          <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[linear-gradient(180deg,#fafafa_0%,#f1f1f3_100%)] sm:aspect-auto sm:h-full sm:w-[43%]">
            {createElement(menu_image, {
              item: active_item,
              className: 'h-full w-full',
              variant: 'card',
            })}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 to-transparent sm:hidden" />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-[28px] sm:text-[32px] font-bold leading-[1.05] text-neutral-900">
                  {active_item.name}
                </h3>
                <div className="mt-3 inline-flex rounded-full bg-[#f3f4f6] p-0.5">
                  {volumes.map((option) => {
                    const active = option.id === volume;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => set_volume(option.id)}
                        className={`rounded-full px-3.5 py-1.5 text-sm transition-all ${
                          active
                            ? 'bg-white text-neutral-900 font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                            : 'text-neutral-500 hover:text-neutral-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="mt-4 text-[15px] leading-relaxed text-neutral-700">{description}</p>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => set_details_open((o) => !o)}
                  aria-expanded={details_open}
                  className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-neutral-900"
                >
                  состав
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${details_open ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {details_open && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-normal text-neutral-500">
                      <span>{nutrition.kcal} ккал</span>
                      <span>белки {nutrition.protein} г</span>
                      <span>жиры {nutrition.fat} г</span>
                      <span>углеводы {nutrition.carb} г</span>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">
                      {composition.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-7">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="text-[15px] font-medium text-neutral-700">
                      увеличить порцию топпинга{' '}
                      <span className="font-bold font-mono tabular-nums text-neutral-900">
                        +{topping > 0 ? topping * topping_price : topping_price} ₽
                      </span>
                    </p>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label="что за топинг"
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-bold text-neutral-600 transition-colors hover:bg-neutral-300"
                      >
                        i
                      </button>
                      <span className="pointer-events-none absolute left-0 top-7 z-30 w-60 rounded-2xl bg-neutral-900 px-3.5 py-2.5 text-xs leading-relaxed text-white opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                        топинг для этого напитка — {topping_name}. одно увеличение
                        добавляет 1 порцию {topping_name} (+{topping_price} ₽). можно
                        засыпать хоть весь стакан.
                      </span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
                    <button
                      type="button"
                      onClick={() => set_topping((t) => Math.max(0, t - 1))}
                      disabled={topping === 0}
                      aria-label="меньше топинга"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800 transition-opacity disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold font-mono tabular-nums">
                      {topping}
                    </span>
                    <button
                      type="button"
                      onClick={() => set_topping((t) => Math.min(topping_max, t + 1))}
                      disabled={topping >= topping_max}
                      aria-label="больше топинга"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800 transition-opacity disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {show_recommendations && recommendations.length > 0 && (
                <div className="mt-6">
                  <SectionTitle>хорошо сочетается</SectionTitle>
                  <div className="mt-3 grid grid-cols-2 gap-2 gap-y-5 sm:grid-cols-3">
                    {recommendations.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => open_recommendation(rec)}
                        className="group flex h-full w-full flex-col items-center text-center"
                      >
                        <div className="mb-2 aspect-square w-full overflow-hidden rounded-card">
                          {createElement(menu_image, {
                            item: rec,
                            className: 'h-full w-full',
                            variant: 'card',
                          })}
                        </div>
                        <p className="mb-2 w-full px-1 text-[15px] font-bold leading-snug text-neutral-900 line-clamp-2 transition-colors group-hover:text-accent">
                          {rec.name}
                        </p>
                        <span className="mt-auto inline-flex rounded-pill bg-surface px-4 py-2 text-sm font-medium font-mono tabular-nums text-neutral-900 transition-colors group-hover:bg-surface/80">
                          {rec.price} ₽
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#ececf0] bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-500">количество</p>
                <div className="flex items-center gap-1 rounded-full bg-[#f3f4f6] p-1">
                  <button
                    type="button"
                    onClick={() => set_qty((q) => Math.max(1, q - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                  <button
                    type="button"
                    onClick={() => set_qty((q) => q + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-neutral-800"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handle_add_to_cart}
                className="w-full rounded-pill bg-accent py-4 text-base font-semibold font-mono tabular-nums text-white shadow-[0_8px_24px_rgba(255,61,110,0.28)] hover:opacity-95 transition-opacity"
              >
                в корзину за {total_price} ₽
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
