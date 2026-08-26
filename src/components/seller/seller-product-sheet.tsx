'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import {
  configured_unit_price,
  first_volume_id,
  get_composition,
  get_item_volumes,
  get_nutrition,
  get_topping_name,
  get_topping_portion_price_value,
  resolve_volume_id,
} from '@/lib/product-details';
import {
  calc_order_bonus,
  FREE_DRINK_BONUS_THRESHOLD,
  item_has_toppings,
  item_has_volumes,
} from '@/lib/cart-summary';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';

type props = {
  item: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  /** баланс бобаллов гостя, если уже найден по телефону */
  customer_bonus?: number | null;
  /** стартовые опции при правке позиции из корзины */
  initial?: { volume?: string; topping?: number; qty?: number } | null;
  /** режим: обычное добавление / правка / выбор замены */
  mode?: 'add' | 'edit' | 'replace';
  on_close: () => void;
  on_add: (
    item: menu_item,
    qty: number,
    options?: { volume?: string; topping: number }
  ) => void;
  /** начать выбор другого блюда вместо текущего */
  on_start_replace?: () => void;
};

/** упрощённая карточка товара для кассира — без покупательского UI */
export default function seller_product_sheet({
  item,
  all_items,
  open,
  customer_bonus = null,
  initial = null,
  mode = 'add',
  on_close,
  on_add,
  on_start_replace,
}: props) {
  const [active, set_active] = useState<menu_item | null>(item);
  const [qty, set_qty] = useState(1);
  const [volume, set_volume] = useState('500');
  const [topping, set_topping] = useState(0);
  const [details_open, set_details_open] = useState(false);
  const [recs, set_recs] = useState<menu_item[]>([]);

  useEffect(() => {
    if (!open || !item) return;
    set_active(item);
    set_qty(Math.max(1, initial?.qty ?? 1));
    set_volume(resolve_volume_id(item, initial?.volume) ?? first_volume_id(item));
    set_topping(Math.max(0, initial?.topping ?? 0));
    set_details_open(false);
  }, [open, item, initial?.qty, initial?.volume, initial?.topping]);

  useEffect(() => {
    if (!open || !active) {
      set_recs([]);
      return;
    }
    let cancelled = false;
    async function load() {
      const fallback = all_items
        .filter((i) => i.is_available && i.id !== active!.id)
        .filter((i) => i.category === active!.category || i.category.includes('закуск'))
        .slice(0, 3);

      if (!is_supabase_configured()) {
        if (!cancelled) set_recs(fallback);
        return;
      }
      try {
        const supabase = create_client();
        const { data } = await supabase
          .from('menu')
          .select('*')
          .eq('is_available', true)
          .neq('id', active!.id)
          .limit(6);
        const rows = (data as menu_item[]) || [];
        if (!cancelled) set_recs(rows.length ? rows.slice(0, 3) : fallback);
      } catch {
        if (!cancelled) set_recs(fallback);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, active, all_items]);

  const topping_price = get_topping_portion_price_value();
  const topping_name = active ? get_topping_name(active) : 'тапиока';
  const show_volumes = active ? item_has_volumes(active) : false;
  const show_toppings = active ? item_has_toppings(active) : false;
  const volume_options = active ? get_item_volumes(active) : [];
  const volume_ml = volume_options.find((v) => String(v.ml) === volume)?.ml ?? volume_options[0]?.ml ?? 500;
  const topping_max = Math.max(4, Math.round(volume_ml / 60));
  const topping_used = show_toppings ? topping : 0;
  const volume_used = show_volumes ? volume : undefined;
  const unit = active ? configured_unit_price(active, volume_used, topping_used) : 0;
  const line_total = unit * qty;
  const bonus_earn = active
    ? calc_order_bonus([{ id: active.id, category: active.category, quantity: qty }])
    : 0;
  const can_pay_with_bonus =
    customer_bonus != null && customer_bonus >= FREE_DRINK_BONUS_THRESHOLD;

  const composition = useMemo(
    () => (active ? get_composition(active) : []),
    [active]
  );
  const nutrition = useMemo(
    () => (active ? get_nutrition(active, volume_ml, topping_used) : null),
    [active, volume_ml, topping_used]
  );

  if (!open || !active) return null;

  function add_current() {
    on_add(active!, qty, { volume: volume_used, topping: topping_used });
    on_close();
  }

  function suggest(rec: menu_item) {
    on_add(rec, 1, {
      volume: resolve_volume_id(rec),
      topping: 0,
    });
    set_active(rec);
    set_qty(1);
    set_volume(first_volume_id(rec));
    set_topping(0);
    set_details_open(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={on_close}
      />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        style={{
          maxHeight: 'min(92dvh, calc(100dvh - var(--safe-top) - var(--safe-bottom) - 1rem))',
        }}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" />

        <div className="relative mx-4 mt-2 aspect-[16/9] max-h-[28vh] w-auto shrink-0 overflow-hidden rounded-2xl bg-white self-stretch border border-neutral-100">
          {createElement(menu_image, {
            item: active,
            className: 'h-full w-full',
            variant: 'fill',
            fit: 'contain',
          })}
          <button
            type="button"
            onClick={on_close}
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/95 text-base font-bold text-neutral-700 shadow"
            aria-label="закрыть"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-3">
          <div className="shrink-0">
            <h3 className="text-lg font-bold leading-tight text-neutral-900 line-clamp-2">
              {active.name}
            </h3>
            <p className="mt-0.5 text-base font-bold tabular-nums text-neutral-800">{unit} ₽</p>
            {can_pay_with_bonus ? (
              <p className="mt-1.5 rounded-xl bg-accent/10 px-3 py-2 text-xs font-semibold leading-snug text-accent">
                у гостя {customer_bonus} бб — можно списать {FREE_DRINK_BONUS_THRESHOLD} бб и
                отдать напиток бесплатно
              </p>
            ) : bonus_earn > 0 ? (
              <p className="mt-1.5 text-xs font-medium text-neutral-500">
                начислим{' '}
                <span className="font-semibold tabular-nums text-accent">+{bonus_earn}</span>{' '}
                бобаллов
                {customer_bonus != null ? (
                  <span className="text-neutral-400"> · сейчас {customer_bonus} бб</span>
                ) : null}
              </p>
            ) : null}
          </div>

          {show_volumes && volume_options.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-2">
            {volume_options.map((v) => {
              const id = String(v.ml);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set_volume(id)}
                  className={`rounded-xl border py-2 text-sm font-semibold ${
                    volume === id
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-700'
                  }`}
                >
                  {v.ml} мл
                  {v.add ? ` · +${v.add}₽` : ''}
                </button>
              );
            })}
          </div>
          )}

          {show_toppings && (
          <div className="flex shrink-0 items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">
              {topping_name}{' '}
              <span className="font-mono font-semibold">+{topping_price} ₽</span>
            </p>
            <div className="flex items-center gap-1 rounded-full bg-white border border-neutral-200 p-1">
              <button
                type="button"
                onClick={() => set_topping((t) => Math.max(0, t - 1))}
                className="h-8 w-8 rounded-full text-lg"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{topping}</span>
              <button
                type="button"
                onClick={() => set_topping((t) => Math.min(topping_max, t + 1))}
                className="h-8 w-8 rounded-full text-lg"
              >
                +
              </button>
            </div>
          </div>
          )}

          <div className="flex shrink-0 items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">количество</p>
            <div className="flex items-center gap-1 rounded-full bg-white border border-neutral-200 p-1">
              <button
                type="button"
                onClick={() => set_qty((q) => Math.max(1, q - 1))}
                className="h-8 w-8 rounded-full text-lg"
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => set_qty((q) => q + 1)}
                className="h-8 w-8 rounded-full text-lg"
              >
                +
              </button>
            </div>
          </div>

          <div className="min-h-0 shrink overflow-hidden">
            <button
              type="button"
              onClick={() => set_details_open((o) => !o)}
              className="text-sm font-semibold text-neutral-900"
            >
              состав {details_open ? '▴' : '▾'}
            </button>
            {details_open && nutrition ? (
              <div className="mt-1 text-xs text-neutral-600 line-clamp-3">
                {nutrition.kcal} ккал · {composition.slice(0, 4).join(', ')}
              </div>
            ) : null}
          </div>

          {mode === 'add' && recs.length > 0 ? (
            <div className="min-h-0 shrink">
              <p className="mb-1.5 text-xs font-semibold text-neutral-900">предложите гостю</p>
              <div className="grid grid-cols-3 gap-2">
                {recs.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => suggest(rec)}
                    className="flex flex-col items-center text-center rounded-xl border border-neutral-100 bg-white p-1.5"
                  >
                    <div className="mb-1 aspect-square w-full max-h-16 overflow-hidden rounded-xl bg-white">
                      {createElement(menu_image, {
                        item: rec,
                        className: 'h-full w-full',
                        variant: 'fill',
                        fit: 'contain',
                      })}
                    </div>
                    <span className="line-clamp-2 text-[10px] font-medium leading-tight text-neutral-700">
                      {rec.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-auto flex shrink-0 flex-col gap-2">
            {mode === 'edit' && on_start_replace ? (
              <button
                type="button"
                onClick={on_start_replace}
                className="w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-800"
              >
                заменить
              </button>
            ) : null}
            <button
              type="button"
              onClick={add_current}
              className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white"
            >
              {mode === 'replace'
                ? `заменить · ${line_total} ₽`
                : mode === 'edit'
                  ? `сохранить · ${line_total} ₽`
                  : `в заказ · ${line_total} ₽`}
              {mode === 'add' && bonus_earn > 0 ? ` · +${bonus_earn} бб` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
