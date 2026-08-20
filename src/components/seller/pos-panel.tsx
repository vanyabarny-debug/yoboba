'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import {
  default_categories,
  get_menu_store,
  normalize_menu_item_images,
  resolve_menu_item_image_url,
  subscribe_menu_store,
} from '@/lib/menu-store';
import { format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { category_tile_meta } from '@/lib/category-icons';
import { configured_unit_price, first_volume_id, resolve_volume_id } from '@/lib/product-details';
import { tile_grid, board_tile_grid } from '@/lib/seller-tile-grid';
import { calc_order_bonus, FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { gift_items_label } from '@/lib/gifts';
import { use_page_swipe } from '@/lib/use-page-swipe';
import type { gift, menu_item, order_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import seller_product_sheet from '@/components/seller/seller-product-sheet';

type cart_line = order_item & {
  volume?: string;
  topping?: number;
};

type props = {
  on_created: () => void;
  on_nav_depth?: (in_products: boolean) => void;
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
  if (line.volume) bits.push(`${line.volume} мл`);
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
    <div className="shrink-0">
      <button
        type="button"
        onClick={on_work}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <span>в работу</span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{count} поз.</span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">{total} ₽</span>
      </button>
    </div>
  );
}

/** прогрев кэша браузера для картинок меню кассы */
function warm_menu_image_cache(list: menu_item[]) {
  if (typeof window === 'undefined') return;
  const urls = [
    ...new Set(
      list
        .map((i) => resolve_menu_item_image_url(i))
        .filter((u) => u && !u.endsWith('.svg'))
    ),
  ];
  for (const url of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
  if ('caches' in window) {
    void caches.open('yoboba-pos-menu-v1').then((cache) => {
      for (const url of urls) {
        void cache.match(url).then((hit) => {
          if (!hit) void cache.add(url).catch(() => {});
        });
      }
    });
  }
}

export default function pos_panel({
  on_created,
  on_nav_depth,
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
  const [lookup_gifts, set_lookup_gifts] = useState<gift[]>([]);
  const [gift_busy, set_gift_busy] = useState<string | null>(null);
  const [lookup_busy, set_lookup_busy] = useState(false);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [paid_now, set_paid_now] = useState(false);
  const [pay_with_bonus, set_pay_with_bonus] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [sheet_open, set_sheet_open] = useState(false);
  /** индекс позиции в корзине: правка опций или замена на другое блюдо */
  const [edit_index, set_edit_index] = useState<number | null>(null);
  const [replace_index, set_replace_index] = useState<number | null>(null);

  useEffect(() => {
    on_nav_depth?.(step === 'products');
  }, [step, on_nav_depth]);

  useEffect(() => {
    function sync() {
      const store = get_menu_store();
      const available = normalize_menu_item_images(store.items.filter((i) => i.is_available));
      set_items(available);
      const from_menu = (store.categories.length ? store.categories : default_categories).filter(
        (c) => available.some((i) => i.category === c)
      );
      set_categories(from_menu.length ? from_menu : store.categories);
      warm_menu_image_cache(available);
    }
    sync();
    return subscribe_menu_store(sync);
  }, []);

  useEffect(() => {
    if (!confirm_open) return;
    const e164 = phone_input_to_e164(phone_draft);
    if (!e164) {
      set_customer(null);
      set_lookup_gifts([]);
      return;
    }

    let cancelled = false;
    set_lookup_busy(true);
    const t = window.setTimeout(() => {
      void Promise.all([
        fetch(`/api/seller/orders?phone=${encodeURIComponent(e164)}`, {
          credentials: 'same-origin',
        }).then((r) => r.json()) as Promise<{ customer?: found_customer | null }>,
        fetch(`/api/seller/gifts?phone=${encodeURIComponent(e164)}`, {
          credentials: 'same-origin',
        }).then((r) => r.json()) as Promise<{ gifts?: gift[] }>,
      ])
        .then(([orders_body, gifts_body]) => {
          if (cancelled) return;
          set_customer(orders_body.customer || null);
          set_lookup_gifts(gifts_body.gifts || []);
        })
        .catch(() => {
          if (!cancelled) {
            set_customer(null);
            set_lookup_gifts([]);
          }
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

  // свайп в товарах всегда возвращает к категориям (не листает категории)
  const { viewport_ref, page_style } = use_page_swipe({
    index: 0,
    count: 1,
    enabled: step === 'products' && !sheet_open && !confirm_open,
    on_index: () => {},
    on_edge_back: () => {
      set_step('categories');
      set_category('');
    },
  });

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const bonus_preview = calc_order_bonus(
    cart.map((line) => ({
      menu_id: line.menu_id,
      quantity: line.quantity,
      category: items.find((i) => i.id === line.menu_id)?.category,
    }))
  );

  function open_category(c: string) {
    set_category(c);
    set_step('products');
  }

  function back_to_categories() {
    set_step('categories');
    set_category('');
  }

  function cancel_replace() {
    set_replace_index(null);
    set_edit_index(null);
    set_sheet_open(false);
    set_selected(null);
  }

  function open_item(item: menu_item) {
    if (replace_index != null) {
      const qty = cart[replace_index]?.quantity ?? 1;
      add_configured(item, qty, { volume: resolve_volume_id(item), topping: 0 });
      return;
    }
    set_edit_index(null);
    set_selected(item);
    set_sheet_open(true);
  }

  function open_cart_line(index: number) {
    const line = cart[index];
    if (!line) return;
    const item = items.find((i) => i.id === line.menu_id);
    if (!item) return;
    set_edit_index(index);
    set_replace_index(null);
    set_selected(item);
    set_sheet_open(true);
  }

  function start_replace_from_sheet() {
    const idx = edit_index;
    if (idx == null) return;
    set_replace_index(idx);
    set_edit_index(null);
    set_sheet_open(false);
    set_selected(null);
    set_confirm_open(false);
    set_step('categories');
    set_category('');
  }

  function build_line(
    item: menu_item,
    qty: number,
    options?: { volume?: string; topping: number }
  ): cart_line {
    const volume = resolve_volume_id(item, options?.volume);
    const topping = options?.topping ?? 0;
    const unit = configured_unit_price(item, volume, topping);
    const name_bits = [item.name];
    if (volume) name_bits.push(`${volume}мл`);
    if (topping > 0) name_bits.push(`+топ.${topping}`);
    return {
      menu_id: item.id,
      name: name_bits.join(' '),
      price: unit,
      quantity: qty,
      volume,
      topping,
    };
  }

  function add_configured(
    item: menu_item,
    qty: number,
    options?: { volume?: string; topping: number }
  ) {
    const line = build_line(item, qty, options);

    if (replace_index != null) {
      const idx = replace_index;
      set_cart((prev) => {
        if (idx < 0 || idx >= prev.length) return prev;
        const next = [...prev];
        next[idx] = line;
        return next;
      });
      set_replace_index(null);
      set_edit_index(null);
      set_confirm_open(true);
      return;
    }

    if (edit_index != null) {
      const idx = edit_index;
      set_cart((prev) => {
        if (idx < 0 || idx >= prev.length) return prev;
        const next = [...prev];
        next[idx] = line;
        return next;
      });
      set_edit_index(null);
      return;
    }

    set_cart((prev) => {
      const key_match = (r: cart_line) =>
        r.menu_id === line.menu_id &&
        (r.volume ?? '') === (line.volume ?? '') &&
        (r.topping ?? 0) === (line.topping ?? 0);
      const idx = prev.findIndex(key_match);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, line];
    });
  }

  function change_qty(index: number, delta: number) {
    set_cart((prev) =>
      prev
        .map((r, i) => (i === index ? { ...r, quantity: r.quantity + delta } : r))
        .filter((r) => r.quantity > 0)
    );
  }

  async function redeem_gift(gift_id: string) {
    if (gift_busy) return;
    set_gift_busy(gift_id);
    set_error(null);
    try {
      const res = await fetch('/api/seller/gifts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ gift_id, pickup_minutes: 8 }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось выдать подарок');
        return;
      }
      set_lookup_gifts((prev) => prev.filter((g) => g.id !== gift_id));
      set_confirm_open(false);
      on_created();
    } catch {
      set_error('не удалось выдать подарок');
    } finally {
      set_gift_busy(null);
    }
  }

  async function submit() {
    if (!cart.length || busy) return;
    const phone = phone_input_to_e164(phone_draft);
    if (phone_draft.trim() && !phone) {
      set_error('введите телефон полностью');
      return;
    }

    const can_bonus =
      Boolean(phone) &&
      customer != null &&
      customer.bonus_balance >= FREE_DRINK_BONUS_THRESHOLD;
    if (pay_with_bonus && !can_bonus) {
      set_error('нельзя списать бобы: нужен гость с балансом ≥ 50 б.');
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
          is_paid: paid_now || pay_with_bonus,
          payment_type: pay_with_bonus ? 'bonus' : 'cash',
          redeem_bonus: pay_with_bonus,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'не удалось создать заказ');
      }
      const created = (await res.json()) as {
        order?: { id: string; total_price: number; items?: order_item[] };
        bonus_balance?: number;
      };
      const order = created.order;
      if (typeof created.bonus_balance === 'number' && customer) {
        set_customer({ ...customer, bonus_balance: created.bonus_balance });
      }

      if (paid_now && !pay_with_bonus && order) {
        const order_total =
          Number(order.total_price) || cart.reduce((s, l) => s + l.price * l.quantity, 0);
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
            order_total,
            payment_method: 'cash',
            amount_received: order_total,
            change_given: 0,
            items_summary,
            shift_date: shift_date || undefined,
            spot_id,
            spot_address,
            shift_id,
          }),
        });
      }

      if (pay_with_bonus && order) {
        await fetch('/api/cash', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            id: `cash-${Date.now()}`,
            order_id: order.id,
            seller_id,
            seller_name,
            order_total: 0,
            payment_method: 'bonus',
            amount_received: null,
            change_given: null,
            items_summary: cart.map((l) => `${l.name} ×${l.quantity}`).join('; '),
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
      set_pay_with_bonus(false);
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
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900 truncate">{line_label(line)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
                    <button
                      type="button"
                      onClick={() => open_cart_line(index)}
                      className="ml-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700"
                    >
                      изменить
                    </button>
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-semibold text-neutral-800">
                  {line.price * line.quantity} ₽
                </span>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-white border border-neutral-200 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-neutral-500">итого</span>
            <span className="text-xl font-bold tabular-nums text-neutral-900">
              {pay_with_bonus ? '0 ₽' : `${total} ₽`}
            </span>
          </div>

          {customer && customer.bonus_balance >= FREE_DRINK_BONUS_THRESHOLD ? (
            <label className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-3">
              <input
                type="checkbox"
                checked={pay_with_bonus}
                onChange={(e) => {
                  set_pay_with_bonus(e.target.checked);
                  if (e.target.checked) set_paid_now(true);
                }}
                className="mt-0.5 rounded"
              />
              <span className="min-w-0 text-xs font-semibold leading-snug text-accent">
                списать {FREE_DRINK_BONUS_THRESHOLD} б. · напиток бесплатно
                <span className="mt-0.5 block font-medium text-neutral-600">
                  у гостя {customer.bonus_balance} б.
                </span>
              </span>
            </label>
          ) : bonus_preview > 0 ? (
            <p className="text-xs text-neutral-500">
              начислим{' '}
              <span className="font-semibold tabular-nums text-accent">
                +{bonus_preview}
              </span>{' '}
              бобов
              {customer ? (
                <span className="text-neutral-400"> · сейчас {customer.bonus_balance} б.</span>
              ) : null}
            </p>
          ) : null}

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
              <span className="text-neutral-400"> · {customer.bonus_balance} бобов</span>
            </p>
          ) : null}

          {lookup_gifts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">оплаченные подарки на этот номер</p>
              {lookup_gifts.map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-800">
                      {gift_items_label(g.items)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      от {g.sender_name}
                      {g.message ? ` · ${g.message}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={gift_busy === g.id}
                    onClick={() => void redeem_gift(g.id)}
                    className="shrink-0 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    {gift_busy === g.id ? '…' : 'в работу'}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={paid_now || pay_with_bonus}
              disabled={pay_with_bonus}
              onChange={(e) => set_paid_now(e.target.checked)}
              className="rounded"
            />
            уже оплачен
            {pay_with_bonus ? (
              <span className="text-xs text-accent">· бобами</span>
            ) : null}
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

  const editing_line =
    edit_index != null && cart[edit_index] ? cart[edit_index] : null;
  const sheet_mode =
    replace_index != null ? 'replace' : edit_index != null ? 'edit' : 'add';
  const replace_label =
    replace_index != null && cart[replace_index]
      ? line_label(cart[replace_index])
      : null;

  const replace_banner =
    replace_index != null ? (
      <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2.5">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-accent">
          выберите блюдо вместо «{replace_label}»
        </p>
        <button
          type="button"
          onClick={cancel_replace}
          className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 border border-neutral-200"
        >
          отмена
        </button>
      </div>
    ) : null;

  const sheet = createElement(seller_product_sheet, {
    item: selected,
    all_items: items,
    open: sheet_open,
    customer_bonus: customer?.bonus_balance ?? null,
    mode: sheet_mode,
    initial: editing_line
      ? {
          volume: editing_line.volume ?? first_volume_id(selected),
          topping: editing_line.topping ?? 0,
          qty: editing_line.quantity,
        }
      : replace_index != null && cart[replace_index]
        ? { qty: cart[replace_index].quantity, volume: first_volume_id(selected), topping: 0 }
        : null,
    on_close: () => {
      set_sheet_open(false);
      set_selected(null);
      set_edit_index(null);
    },
    on_add: add_configured,
    on_start_replace: edit_index != null ? start_replace_from_sheet : undefined,
  });

  if (step === 'categories') {
    const { cols, rows } = tile_grid(categories.length);
    return (
      <div className="flex flex-col flex-1 min-h-0 h-full gap-2 overflow-hidden">
        {replace_banner}
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
        <button
          type="button"
          onClick={() => set_confirm_open(true)}
          className="shrink-0 py-1 text-center text-xs font-medium text-neutral-500"
        >
          выдать подарок по телефону
        </button>
        {confirm_modal}
        {sheet}
      </div>
    );
  }

  const { cols: prod_cols, rows: prod_rows } = board_tile_grid(filtered.length || 1);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-2 overflow-hidden">
      {replace_banner}
      <div ref={viewport_ref} className="relative flex-1 min-h-0 overflow-hidden touch-pan-y">
        <div className="flex h-full min-h-0 flex-col gap-2" style={page_style(0)}>
          <div className="flex items-center gap-2 shrink-0 px-0.5">
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
                className={`flex h-full min-h-0 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-white px-2 py-2 active:scale-[0.98] transition overflow-hidden ${
                  replace_index != null
                    ? 'border-accent ring-1 ring-accent/30'
                    : 'border-neutral-200'
                }`}
              >
                <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
                  {createElement(menu_image, {
                    item,
                    className: 'h-full w-full max-h-full',
                    variant: 'fill',
                    fit: 'contain',
                  })}
                </div>
                <span className="shrink-0 text-xs sm:text-sm font-semibold leading-snug text-center text-neutral-900 px-1 line-clamp-2">
                  {item.name}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                  {item.price} ₽
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="col-span-full self-center text-sm text-neutral-400 text-center">
                в разделе пока пусто
              </p>
            ) : null}
          </div>
        </div>
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
