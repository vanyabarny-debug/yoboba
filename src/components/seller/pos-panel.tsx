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

function line_label(line: cart_line) {
  const bits = [line.name];
  if (line.volume === '650') bits.push('650 мл');
  if (line.topping && line.topping > 0) bits.push(`топ. ×${line.topping}`);
  return bits.join(' · ');
}

export default function pos_panel({ on_created }: props) {
  const [items, set_items] = useState<menu_item[]>([]);
  const [categories, set_categories] = useState<string[]>(default_categories);
  const [category, set_category] = useState<string>('');
  const [cart, set_cart] = useState<cart_line[]>([]);
  const [phone_draft, set_phone_draft] = useState('');
  const [customer, set_customer] = useState<found_customer | null>(null);
  const [lookup_busy, set_lookup_busy] = useState(false);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [paid_now, set_paid_now] = useState(false);
  const [bonus_note, set_bonus_note] = useState<string | null>(null);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [drawer_open, set_drawer_open] = useState(false);

  useEffect(() => {
    function sync() {
      const store = get_menu_store();
      const cats = store.categories.length ? store.categories : default_categories;
      set_items(store.items.filter((i) => i.is_available));
      set_categories(cats);
      set_category((prev) => (prev && cats.includes(prev) ? prev : cats[0] || ''));
    }
    sync();
    return subscribe_menu_store(sync);
  }, []);

  useEffect(() => {
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
  }, [phone_draft]);

  const filtered = useMemo(() => {
    if (!category) return items;
    return items.filter((i) => i.category === category);
  }, [items, category]);

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

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
    set_bonus_note(null);
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
      const body = (await res.json()) as { bonus_earned?: number };
      if (body.bonus_earned && body.bonus_earned > 0) {
        set_bonus_note(`+${body.bonus_earned} тапикоинов начислено`);
      }
      set_cart([]);
      set_phone_draft('');
      set_customer(null);
      set_paid_now(false);
      on_created();
    } catch (e) {
      set_error(e instanceof Error ? e.message : 'ошибка');
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">быстрый заказ</h2>
        <p className="text-sm text-neutral-500 mt-0.5">плитки меню · объём и топинги как в зале</p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {categories.map((c) => {
          const meta = category_tile_meta(c);
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => set_category(c)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-3 transition ${
                active
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              {meta.icon({ className: 'h-6 w-6' })}
              <span className="text-[10px] font-semibold leading-tight text-center line-clamp-2">
                {meta.short}
              </span>
            </button>
          );
        })}
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

      <div className="sticky bottom-3 rounded-3xl border border-neutral-200 bg-white/95 backdrop-blur-xl p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] space-y-3">
        {cart.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-2">
            корзина пуста — откройте карточку через i
          </p>
        ) : (
          <ul className="space-y-2 max-h-40 overflow-y-auto">
            {cart.map((line, index) => (
              <li key={`${line.menu_id}-${line.volume}-${line.topping}-${index}`} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate font-medium text-neutral-800">
                  {line_label(line)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => change_qty(index, -1)}
                    className="h-8 w-8 rounded-lg bg-neutral-100 text-neutral-700"
                  >
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums font-semibold">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => change_qty(index, 1)}
                    className="h-8 w-8 rounded-lg bg-neutral-100 text-neutral-700"
                  >
                    +
                  </button>
                </div>
                <span className="w-16 text-right tabular-nums text-neutral-600">
                  {line.price * line.quantity} ₽
                </span>
              </li>
            ))}
          </ul>
        )}

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
        ) : phone_input_to_e164(phone_draft) ? (
          <p className="text-xs text-neutral-400">в базе нет — заказ без баллов</p>
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
        {bonus_note ? <p className="text-sm text-neutral-600">{bonus_note}</p> : null}

        <button
          type="button"
          disabled={!cart.length || busy}
          onClick={() => void submit()}
          className="w-full rounded-2xl bg-neutral-900 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'создаём…' : `в работу · ${total} ₽`}
        </button>
      </div>

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
