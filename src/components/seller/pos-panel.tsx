'use client';

import { createElement, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import {
  default_categories,
  get_menu_store,
  normalize_menu_item_images,
  subscribe_menu_store,
} from '@/lib/menu-store';
import { format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { category_tile_meta } from '@/lib/category-icons';
import { get_topping_portion_price_value } from '@/lib/product-details';
import { tile_grid } from '@/lib/seller-tile-grid';
import type { menu_item, order_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import seller_product_sheet from '@/components/seller/seller-product-sheet';

type cart_line = order_item & {
  volume?: '450' | '650';
  topping?: number;
};

type props = {
  on_created: () => void;
  seller_id?: string;
  seller_name?: string;
  shift_id?: string | null;
  shift_date?: string;
  spot_id?: string | null;
  spot_address?: string | null;
};

type found_customer = {
  id: string;
  name: string | null;
  phone: string | null;
  bonus_balance: number;
};

type step = 'categories' | 'products';

function line_label(line: cart_line) {
  const bits = [line.name];
  if (line.volume === '650') bits.push('650 мл');
  if (line.topping && line.topping > 0) bits.push(`топ. ×${line.topping}`);
  return bits.join(' · ');
}

function cart_bar({
  count,
  total,
  on_work,
}: {
  count: number;
  total: number;
  on_work: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="shrink-0 rounded-2xl border border-neutral-200 bg-white/95 backdrop-blur-xl p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm text-neutral-600">
          <span className="font-semibold text-neutral-900">{count}</span> поз.
        </p>
        <p className="text-base font-bold tabular-nums text-neutral-900">{total} ₽</p>
      </div>
      <button
        type="button"
        onClick={on_work}
        className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white"
      >
        в работу
      </button>
    </div>
  );
}

export default function pos_panel({
  on_created,
  seller_id = 'seller',
  seller_name = 'бариста',
  shift_id = null,
  shift_date,
  spot_id = null,
  spot_address = null,
}: props) {
  const [items, set_items] = useState<menu_item[]>([]);
  const [categories, set_categories] = useState<string[]>(default_categories);
  const [step, set_step] = useState<step>('categories');
  const [category, set_category] = useState<string>('');
  const [cart, set_cart] = useState<cart_line[]>([]);
  const [phone_draft, set_phone_draft] = useState('');
  const [customer, set_customer] = useState<found_customer | null>(null);
  const [lookup_busy, set_lookup_busy] = useState(false);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [paid_now, set_paid_now] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [sheet_open, set_sheet_open] = useState(false);
  const swipe_x = useRef<number | null>(null);

  useEffect(() => {
    function sync() {
      const store = get_menu_store();
      const available = normalize_menu_item_images(store.items.filter((i) => i.is_available));
      set_items(available);
      const from_menu = (store.categories.length ? store.categories : default_categories).filter(
        (c) => available.some((i) => i.category === c)
      );
      set_categories(from_menu.length ? from_menu : store.categories);
    }
    sync();
    return subscribe_menu_store(sync);
  }, []);

  useEffect(() => {
    if (!confirm_open) return;
    const e164 = phone_input_to_e164(phone_draft);
    if (!e164) {
      set_customer(null);
      return;
    }

    let cancelled = false;
    set_lookup_busy(true);
    const t = window.setTimeout(() => {
      void fetch(`/api/seller/orders?phone=${encodeURIComponent(e164)}`, {
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((body: { customer?: found_customer | null }) => {
          if (cancelled) return;
          set_customer(body.customer || null);
        })
        .catch(() => {
          if (!cancelled) set_customer(null);
        })
        .finally(() => {
          if (!cancelled) set_lookup_busy(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [phone_draft, confirm_open]);

  const filtered = useMemo(() => {
    if (!category) return [];
    return items.filter((i) => i.category === category);
  }, [items, category]);

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  function open_category(c: string) {
    set_category(c);
    set_step('products');
  }

  function back_to_categories() {
    set_step('categories');
    set_category('');
  }

  function on_products_touch_start(e: TouchEvent) {
    const t = e.changedTouches[0];
    swipe_x.current = t ? t.clientX : null;
  }

  function on_products_touch_end(e: TouchEvent) {
    const start = swipe_x.current;
    swipe_x.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX;
    if (end == null) return;
    // назад к категориям — только свайп от левого края
    if (start <= 56 && end - start > 64) {
      e.stopPropagation();
      back_to_categories();
    }
  }

  function open_item(item: menu_item) {
    set_selected(item);
    set_sheet_open(true);
  }

  function add_configured(
    item: menu_item,
    qty: number,
    options?: { volume: '450' | '650'; topping: number }
  ) {
    const volume = options?.volume ?? '450';
    const topping = options?.topping ?? 0;
    const volume_add = volume === '650' ? 50 : 0;
    const unit = Math.max(
      0,
      item.price + volume_add + topping * get_topping_portion_price_value()
    );
    const name_bits = [item.name];
    if (volume === '650') name_bits.push('650мл');
    if (topping > 0) name_bits.push(`+топ.${topping}`);

    set_cart((prev) => {
      const key_match = (r: cart_line) =>
        r.menu_id === item.id &&
        (r.volume ?? '450') === volume &&
        (r.topping ?? 0) === topping;
      const idx = prev.findIndex(key_match);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [
        ...prev,
        {
          menu_id: item.id,
          name: name_bits.join(' '),
          price: unit,
          quantity: qty,
          volume,
          topping,
        },
      ];
    });
  }

  function change_qty(index: number, delta: number) {
    set_cart((prev) =>
      prev
        .map((r, i) => (i === index ? { ...r, quantity: r.quantity + delta } : r))
        .filter((r) => r.quantity > 0)
    );
  }

  async function submit() {
    if (!cart.length || busy) return;
    const phone = phone_input_to_e164(phone_draft);
    if (phone_draft.trim() && !phone) {
      set_error('введите телефон полностью');
      return;
    }

    set_busy(true);
    set_error(null);
    try {
      const res = await fetch('/api/seller/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          items: cart.map(({ menu_id, name, price, quantity }) => ({
            menu_id,
            name,
            price,
            quantity,
          })),
          customer_phone: phone,
          customer_name: customer?.name || undefined,
          pickup_minutes: 10,
          is_paid: paid_now,
          payment_type: 'cash',
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'не удалось создать заказ');
      }
      const created = (await res.json()) as {
        order?: { id: string; total_price: number; items?: order_item[] };
      };
      const order = created.order;

      if (paid_now && order) {
        const total = Number(order.total_price) || cart.reduce((s, l) => s + l.price * l.quantity, 0);
        const items_summary =
          (order.items || cart)
            .map((i) => `${i.name} ×${i.quantity}`)
            .join('; ') || cart.map((l) => `${l.name} ×${l.quantity}`).join('; ');
        await fetch('/api/cash', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            id: `cash-${Date.now()}`,
            order_id: order.id,
            seller_id,
            seller_name,
            order_total: total,
            payment_method: 'cash',
            amount_received: total,
            change_given: 0,
            items_summary,
            shift_date: shift_date || undefined,
            spot_id,
            spot_address,
            shift_id,
          }),
        });
      }

      set_cart([]);
      set_phone_draft('');
      set_customer(null);
      set_paid_now(false);
      set_confirm_open(false);
      set_step('categories');
      set_category('');
      on_created();
    } catch (e) {
      set_error(e instanceof Error ? e.message : 'ошибка');
    } finally {
      set_busy(false);
    }
  }

  const confirm_modal = confirm_open ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={() => set_confirm_open(false)}
      />
      <div className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
          <h3 className="text-lg font-bold text-neutral-900">всё верно?</h3>
          <p className="text-sm text-neutral-500 mt-0.5">заказ уйдёт в работу</p>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          <ul className="space-y-2">
            {cart.map((line, index) => (
              <li
                key={`${line.menu_id}-${index}`}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 truncate">{line_label(line)}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => change_qty(index, -1)}
                      className="h-7 w-7 rounded-lg bg-neutral-100"
                    >
                      −
                    </button>
                    <span className="w-5 text-center tabular-nums text-xs font-semibold">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => change_qty(index, 1)}
                      className="h-7 w-7 rounded-lg bg-neutral-100"
                    >
                      +
                    </button>
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-semibold text-neutral-800">
                  {line.price * line.quantity} ₽
                </span>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-neutral-100 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-neutral-500">итого</span>
            <span className="text-xl font-bold tabular-nums text-neutral-900">{total} ₽</span>
          </div>

          <label className="block">
            <span className="text-xs text-neutral-500">телефон гостя</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5">
              <span className="text-sm text-neutral-400">+7</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone_draft}
                onChange={(e) => set_phone_draft(format_phone_input(e.target.value))}
                placeholder="900 000-00-00"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          {lookup_busy ? (
            <p className="text-xs text-neutral-400">ищем в базе…</p>
          ) : customer ? (
            <p className="text-sm text-neutral-700">
              <span className="font-semibold">{customer.name || 'гость'}</span>
              <span className="text-neutral-400"> · {customer.bonus_balance} тапикоинов</span>
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={paid_now}
              onChange={(e) => set_paid_now(e.target.checked)}
              className="rounded"
            />
            уже оплачен
          </label>

          {error ? <p className="text-sm text-neutral-700">{error}</p> : null}
        </div>

        <div className="px-5 py-4 border-t border-neutral-100 flex gap-2">
          <button
            type="button"
            onClick={() => set_confirm_open(false)}
            className="flex-1 rounded-xl border border-neutral-200 bg-white py-3.5 text-sm font-medium"
          >
            отмена
          </button>
          <button
            type="button"
            disabled={!cart.length || busy}
            onClick={() => void submit()}
            className="flex-[1.4] rounded-xl bg-accent py-3.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'создаём…' : 'верно'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const sheet = createElement(seller_product_sheet, {
    item: selected,
    all_items: items,
    open: sheet_open,
    on_close: () => {
      set_sheet_open(false);
      set_selected(null);
    },
    on_add: add_configured,
  });

  if (step === 'categories') {
    const { cols, rows } = tile_grid(categories.length);
    return (
      <div className="flex flex-col flex-1 min-h-0 h-full gap-2 overflow-hidden">
        <div
          className="grid flex-1 min-h-0 gap-2 overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {categories.map((c) => {
            const meta = category_tile_meta(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => open_category(c)}
                className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 active:scale-[0.98] transition overflow-hidden"
                style={{
                  backgroundColor: meta.bg,
                  borderColor: meta.border,
                  color: meta.fg,
                }}
              >
                {meta.icon({ className: 'h-8 w-8 sm:h-10 sm:w-10 shrink-0' })}
                <span className="text-xs sm:text-sm font-semibold leading-snug text-center capitalize px-1 line-clamp-2">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {createElement(cart_bar, {
          count,
          total,
          on_work: () => set_confirm_open(true),
        })}
        {confirm_modal}
        {sheet}
      </div>
    );
  }

  const { cols: prod_cols, rows: prod_rows } = tile_grid(filtered.length || 1);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full gap-2 overflow-hidden touch-pan-y"
      onTouchStart={on_products_touch_start}
      onTouchEnd={on_products_touch_end}
    >
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={back_to_categories}
          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700"
        >
          ←
        </button>
        <h2 className="min-w-0 text-sm font-bold text-neutral-900 capitalize truncate">
          {category}
        </h2>
      </div>

      <div
        className="grid flex-1 min-h-0 gap-2 overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${prod_cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${prod_rows}, minmax(0, 1fr))`,
        }}
      >
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => open_item(item)}
            className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-1 rounded-2xl border border-neutral-200 bg-white p-2 text-left active:scale-[0.98] transition overflow-hidden"
          >
            <div className="relative h-full min-h-[3.5rem] w-full overflow-hidden rounded-xl bg-neutral-100">
              {createElement(menu_image, {
                item,
                className: 'h-full w-full',
                variant: 'fill',
              })}
            </div>
            <p className="text-xs sm:text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 text-center">
              {item.name}
            </p>
            <p className="text-sm font-bold tabular-nums text-neutral-900 text-center">
              {item.price} ₽
            </p>
          </button>
        ))}
        {filtered.length === 0 ? (
          <p className="col-span-full self-center text-sm text-neutral-400 text-center">
            в разделе пока пусто
          </p>
        ) : null}
      </div>

      {createElement(cart_bar, {
        count,
        total,
        on_work: () => set_confirm_open(true),
      })}
      {confirm_modal}
      {sheet}
    </div>
  );
}
