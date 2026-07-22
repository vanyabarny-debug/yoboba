'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import {
  default_categories,
  get_menu_store,
  subscribe_menu_store,
} from '@/lib/menu-store';
import { format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { category_tile_meta } from '@/lib/category-icons';
import { get_topping_portion_price_value } from '@/lib/product-details';
import type { menu_item, order_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import product_drawer from '@/components/product-drawer';

type cart_line = order_item & {
  volume?: '450' | '650';
  topping?: number;
};

type props = {
  on_created: () => void;
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

export default function pos_panel({ on_created }: props) {
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
  const [drawer_open, set_drawer_open] = useState(false);

  useEffect(() => {
    function sync() {
      const store = get_menu_store();
      const cats = store.categories.length ? store.categories : default_categories;
      set_items(store.items.filter((i) => i.is_available));
      set_categories(cats);
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

  function open_category(c: string) {
    set_category(c);
    set_step('products');
  }

  function back_to_categories() {
    set_step('categories');
    set_category('');
  }

  function open_item(item: menu_item) {
    set_selected(item);
    set_drawer_open(true);
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
    set_drawer_open(false);
    set_selected(null);
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

  if (step === 'categories') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">быстрый заказ</h2>
          <p className="text-sm text-neutral-500 mt-0.5">выберите раздел меню</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((c) => {
            const meta = category_tile_meta(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => open_category(c)}
                className="flex flex-col items-center justify-center gap-2.5 rounded-3xl border border-neutral-200 bg-white px-3 py-5 text-neutral-800 active:scale-[0.98] transition hover:border-neutral-400"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800">
                  {meta.icon({ className: 'h-8 w-8' })}
                </span>
                <span className="text-sm font-semibold leading-snug text-center capitalize">
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        {cart.length > 0 ? (
          <button
            type="button"
            onClick={() => set_confirm_open(true)}
            className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white"
          >
            к подтверждению · {cart.length} поз. · {total} ₽
          </button>
        ) : null}

        {confirm_open ? render_confirm() : null}
      </div>
    );
  }

  function render_confirm() {
    return (
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
            <h3 className="text-lg font-bold text-neutral-900">подтвердите заказ</h3>
            <p className="text-sm text-neutral-500 mt-0.5">всё верно — отправим в работу</p>
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
              className="flex-[1.4] rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'создаём…' : 'верно · в работу'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back_to_categories}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
        >
          ← разделы
        </button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 capitalize truncate">{category}</h2>
          <p className="text-sm text-neutral-500">нажмите на товар · i для настроек</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="relative rounded-2xl border border-neutral-200 bg-white p-2.5 text-left"
          >
            <button type="button" onClick={() => open_item(item)} className="w-full text-left">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl mb-2">
                {createElement(menu_image, {
                  item,
                  className: 'w-full h-full',
                  variant: 'card',
                })}
              </div>
              <p className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 min-h-[2.5rem]">
                {item.name}
              </p>
              <p className="mt-1.5 text-base font-bold tabular-nums text-neutral-900">
                {item.price} ₽
              </p>
            </button>
            <button
              type="button"
              onClick={() => open_item(item)}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 border border-neutral-200 text-neutral-700 text-sm font-bold shadow-sm"
              aria-label={`подробнее ${item.name}`}
            >
              i
            </button>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="col-span-full text-sm text-neutral-400 text-center py-8">
            в разделе пока пусто
          </p>
        ) : null}
      </div>

      {cart.length > 0 ? (
        <div className="sticky bottom-3 rounded-3xl border border-neutral-200 bg-white/95 backdrop-blur-xl p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-neutral-500 mb-2">
            в заказе {cart.length} поз. · {total} ₽
          </p>
          <button
            type="button"
            onClick={() => set_confirm_open(true)}
            className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white"
          >
            оформить
          </button>
        </div>
      ) : null}

      {confirm_open ? render_confirm() : null}

      {createElement(product_drawer, {
        item: selected,
        all_items: items,
        open: drawer_open,
        on_close: () => {
          set_drawer_open(false);
          set_selected(null);
        },
        on_add: add_configured,
      })}
    </div>
  );
}
