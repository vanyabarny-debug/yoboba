'use client';

import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import {
  get_composition,
  get_nutrition,
  get_topping_name,
  get_topping_portion_price_value,
} from '@/lib/product-details';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';

type props = {
  item: menu_item | null;
  all_items: menu_item[];
  open: boolean;
  on_close: () => void;
  on_add: (
    item: menu_item,
    qty: number,
    options?: { volume: '450' | '650'; topping: number }
  ) => void;
};

const volumes = [
  { id: '450' as const, label: '450 мл', add: 0 },
  { id: '650' as const, label: '650 мл', add: 50 },
];

/** упрощённая карточка товара для кассира — без покупательского UI */
export default function seller_product_sheet({
  item,
  all_items,
  open,
  on_close,
  on_add,
}: props) {
  const [active, set_active] = useState<menu_item | null>(item);
  const [qty, set_qty] = useState(1);
  const [volume, set_volume] = useState<'450' | '650'>('450');
  const [topping, set_topping] = useState(0);
  const [details_open, set_details_open] = useState(false);
  const [recs, set_recs] = useState<menu_item[]>([]);
  const image_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !item) return;
    set_active(item);
    set_qty(1);
    set_volume('450');
    set_topping(0);
    set_details_open(false);
  }, [open, item]);

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
        .slice(0, 4);

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
          .limit(8);
        const rows = (data as menu_item[]) || [];
        if (!cancelled) set_recs(rows.length ? rows.slice(0, 4) : fallback);
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
  const topping_max = 6;
  const volume_add = volume === '650' ? 50 : 0;
  const unit = active
    ? Math.max(0, active.price + volume_add + topping * topping_price)
    : 0;
  const composition = useMemo(
    () => (active ? get_composition(active) : []),
    [active]
  );
  const nutrition = useMemo(
    () => (active ? get_nutrition(active, volume === '650' ? 650 : 450, topping) : null),
    [active, volume, topping]
  );

  if (!open || !active) return null;

  function add_current() {
    on_add(active!, qty, { volume, topping });
    on_close();
  }

  function suggest(rec: menu_item) {
    on_add(rec, 1, { volume: '450', topping: 0 });
    set_active(rec);
    set_qty(1);
    set_volume('450');
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
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-xl">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
        <div ref={image_ref} className="relative aspect-[4/3] w-full bg-neutral-100 overflow-hidden">
          {createElement(menu_image, {
            item: active,
            className: 'h-full w-full',
            variant: 'card',
          })}
          <button
            type="button"
            onClick={on_close}
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/95 text-neutral-700 text-lg font-bold shadow"
            aria-label="закрыть"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-neutral-900">{active.name}</h3>
            <p className="text-lg font-bold tabular-nums text-neutral-800 mt-1">{unit} ₽</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {volumes.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => set_volume(v.id)}
                className={`rounded-xl border py-2.5 text-sm font-semibold ${
                  volume === v.id
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700'
                }`}
              >
                {v.label}
                {v.add ? ` · +${v.add}₽` : ''}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">
              {topping_name}{' '}
              <span className="font-mono font-semibold">+{topping_price} ₽</span>
            </p>
            <div className="flex items-center gap-1 rounded-full bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => set_topping((t) => Math.max(0, t - 1))}
                className="h-9 w-9 rounded-full text-lg"
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{topping}</span>
              <button
                type="button"
                onClick={() => set_topping((t) => Math.min(topping_max, t + 1))}
                className="h-9 w-9 rounded-full text-lg"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">количество</p>
            <div className="flex items-center gap-1 rounded-full bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => set_qty((q) => Math.max(1, q - 1))}
                className="h-9 w-9 rounded-full text-lg"
              >
                −
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                onClick={() => set_qty((q) => q + 1)}
                className="h-9 w-9 rounded-full text-lg"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => set_details_open((o) => !o)}
              className="text-sm font-semibold text-neutral-900"
            >
              состав {details_open ? '▴' : '▾'}
            </button>
            {details_open && nutrition ? (
              <div className="mt-2 text-sm text-neutral-600 space-y-1">
                <p>
                  {nutrition.kcal} ккал · б {nutrition.protein} · ж {nutrition.fat} · у{' '}
                  {nutrition.carb}
                </p>
                <p>{composition.join(', ')}</p>
              </div>
            ) : null}
          </div>

          {recs.length > 0 ? (
            <div>
              <p className="text-sm font-semibold text-neutral-900 mb-2">предложите гостю</p>
              <div className="grid grid-cols-4 gap-2">
                {recs.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => suggest(rec)}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-xl bg-neutral-100 mb-1">
                      {createElement(menu_image, {
                        item: rec,
                        className: 'h-full w-full',
                        variant: 'card',
                      })}
                    </div>
                    <span className="text-[10px] font-medium text-neutral-700 line-clamp-2 leading-tight">
                      {rec.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={add_current}
            className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white"
          >
            в заказ · {unit * qty} ₽
          </button>
        </div>
      </div>
    </div>
  );
}
