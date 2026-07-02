'use client';

import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { menu_item } from '@/lib/types';
import { create_client } from '@/lib/supabase/client';
import menu_image from '@/components/menu-image';
import { menu_badge_on_card } from '@/components/menu-badge';
import { menu_item_has_badge } from '@/lib/menu-badge';
import {
  get_composition,
  get_description,
  get_nutrition,
  get_topping_name,
  get_topping_portion_price_value,
  topping_as_menu_item,
} from '@/lib/product-details';
import { subscribe_site_content_store } from '@/lib/site-content-store';
import { DRAWER_CLOSE_BTN_CLASS, DRAWER_INLINE_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';
import { use_sheet_swipe } from '@/lib/use-sheet-swipe';

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

const SHEET_ANIM_MS = 400;
const SHEET_OPEN_DELAY_MS = 24;

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
  const [sheet_visible, set_sheet_visible] = useState(false);
  const [sheet_open, set_sheet_open] = useState(false);
  const [last_item, set_last_item] = useState<menu_item | null>(null);
  const body_ref = useRef<HTMLDivElement>(null);

  const resolved_item = item ?? last_item;
  const active_item = nav_item ?? resolved_item;
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
    if (item) set_last_item(item);
  }, [item]);

  useEffect(() => {
    if (!open || !item) return;

    set_sheet_visible(true);
    set_sheet_open(false);
    const timer = window.setTimeout(() => set_sheet_open(true), SHEET_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, item?.id]);

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
    if (sheet_visible || open) return;
    set_last_item(null);
    set_nav_item(null);
    set_history([]);
    apply_card_state(default_card_state());
  }, [sheet_visible, open]);

  useEffect(() => {
    if (!sheet_visible && !open) return;
    const prev_overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev_overflow;
    };
  }, [sheet_visible, open]);

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

  const { sheet_props, backdrop_style } = use_sheet_swipe({
    active: sheet_open,
    on_dismiss: finish_view,
    on_back: handle_back,
    can_back: show_back_arrow,
    get_scroll_top: () => body_ref.current?.scrollTop ?? 0,
  });

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

  if ((!sheet_visible && !open) || !resolved_item || !active_item || !nutrition) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className={`product-panel-backdrop absolute inset-0 bg-black/45 backdrop-blur-[3px] ${sheet_open ? 'is-visible' : ''}`}
        style={backdrop_style}
        onClick={handle_back}
      />

      <div className="relative flex h-full w-full max-w-[940px] sm:mx-4 sm:block sm:h-auto">
        <button
          type="button"
          aria-label={show_back_arrow ? 'назад' : 'закрыть'}
          onClick={handle_back}
          className={DRAWER_CLOSE_BTN_CLASS}
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
        <div
          className={`product-panel product-panel-sheet relative flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:h-[min(88vh,620px)] sm:max-h-[88vh] sm:flex-row sm:rounded-[28px] ${sheet_open ? 'is-visible' : ''}`}
          {...sheet_props}
        >
          <div className="relative w-full shrink-0 aspect-square overflow-hidden bg-[#f3f4f6] sm:aspect-auto sm:h-full sm:w-[43%]">
            {createElement(menu_image, {
              item: active_item,
              className: 'h-full w-full sm:!aspect-auto',
              variant: 'card',
            })}
            {menu_item_has_badge(active_item) &&
              createElement(menu_badge_on_card, {
                text: active_item.badge_text!,
              })}
            <button
              type="button"
              aria-label={show_back_arrow ? 'назад' : 'закрыть'}
              onClick={handle_back}
              className={`absolute top-[max(0.75rem,var(--safe-top))] right-3 z-30 sm:hidden ${DRAWER_INLINE_CLOSE_BTN_CLASS}`}
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
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div ref={body_ref} className="product-panel-body flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4 sm:px-7 sm:py-6">
              <div className="pr-10 sm:pr-0">
                <h3 className="text-2xl sm:text-[32px] font-bold leading-tight text-neutral-900">
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
                    <span className="group relative inline-flex shrink-0">
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
                  <div className="mt-2 grid grid-cols-4 gap-1 sm:mt-3 sm:grid-cols-3 sm:gap-2 sm:gap-y-5">
                    {recommendations.map((rec) => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => open_recommendation(rec)}
                        className="group flex min-w-0 flex-col items-center text-center"
                      >
                        <div className="mb-1 aspect-square w-full overflow-hidden rounded-lg sm:mb-2 sm:rounded-card">
                          {createElement(menu_image, {
                            item: rec,
                            className: 'h-full w-full',
                            variant: 'card',
                          })}
                        </div>
                        <p className="mb-1 w-full px-0.5 text-[9px] sm:mb-2 sm:px-1 sm:text-[15px] font-bold leading-tight text-neutral-900 line-clamp-2 transition-colors group-hover:text-accent">
                          {rec.name}
                        </p>
                        <span className="mt-auto inline-flex rounded-pill bg-surface px-1.5 py-0.5 text-[8px] sm:px-4 sm:py-2 sm:text-sm font-medium font-mono tabular-nums text-neutral-900 transition-colors group-hover:bg-surface/80">
                          {rec.price} ₽
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[#ececf0] bg-white px-5 py-4 pb-[max(1rem,var(--safe-bottom))] sm:px-7 sm:py-5 sm:pb-5">
              <div className="min-[1024px]:hidden">
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

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handle_add_to_cart}
                    aria-label={`в корзину за ${total_price} рублей`}
                    className="inline-flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-accent-foreground hover:opacity-95 transition-opacity"
                  >
                    <span className="text-xl font-bold leading-none">+</span>
                    <span className="text-base font-semibold font-mono tabular-nums">{total_price} ₽</span>
                  </button>
                </div>
              </div>

              <div className="hidden min-[1024px]:block">
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
                  className="w-full rounded-pill bg-accent py-4 text-base font-semibold font-mono tabular-nums text-accent-foreground shadow-[0_8px_24px_rgba(4,104,240,0.28)] hover:opacity-95 transition-opacity"
                >
                  в корзину за {total_price} ₽
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
