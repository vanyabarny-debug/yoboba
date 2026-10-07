'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  default_categories,
  get_menu_store,
  normalize_menu_item_images,
  resolve_menu_item_image_url,
  subscribe_menu_store,
} from '@/lib/menu-store';
import { item_in_category } from '@/lib/menu-item-categories';
import { format_phone_display, format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { parse_pickup_code_input } from '@/lib/pickup-code';
import { read_json_response } from '@/lib/read-json-response';
import { category_tile_meta } from '@/lib/category-icons';
import { configured_unit_price, first_volume_id, resolve_volume_id } from '@/lib/product-details';
import { tile_grid, board_tile_grid } from '@/lib/seller-tile-grid';
import { calc_order_bonus, FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { gift_items_label } from '@/lib/gifts';
import { use_page_swipe } from '@/lib/use-page-swipe';
import type { gift, menu_item, order_item } from '@/lib/types';
import { STUDENT_DISCOUNT_LABEL, student_line_price } from '@/lib/student-discount';
import {
  cart_total_after_discount,
  discounted_unit,
  discount_label,
  type pos_discount,
} from '@/lib/pos-pricing';
import menu_image from '@/components/menu-image';
import seller_product_sheet from '@/components/seller/seller-product-sheet';
import pos_qr_scanner from '@/components/seller/pos-qr-scanner';
import { FLOATING_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';

function e164_to_phone_draft(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
    ? digits.slice(1)
    : digits.slice(-10);
  return format_phone_input(local);
}

function close_x() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

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
  student_claimed?: boolean;
  student_verified?: boolean;
};


type step = 'categories' | 'products';

function line_label(line: cart_line) {
  const bits = [line.name];
  if (line.volume && !String(line.name).includes(line.volume)) bits.push(`${line.volume} мл`);
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
  const [code_draft, set_code_draft] = useState('');
  const [active_pickup_code, set_active_pickup_code] = useState<string | null>(null);
  const [scanner_open, set_scanner_open] = useState(false);
  const [customer, set_customer] = useState<found_customer | null>(null);
  const [lookup_gifts, set_lookup_gifts] = useState<gift[]>([]);
  const [gift_busy, set_gift_busy] = useState<string | null>(null);
  const [lookup_busy, set_lookup_busy] = useState(false);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [paid_now, set_paid_now] = useState(false);
  const [pay_with_bonus, set_pay_with_bonus] = useState(false);
  const [confirm_student, set_confirm_student] = useState(false);
  const [confirm_open, set_confirm_open] = useState(false);
  const [selected, set_selected] = useState<menu_item | null>(null);
  const [sheet_open, set_sheet_open] = useState(false);
  /** индекс позиции в корзине: правка опций или замена на другое блюдо */
  const [edit_index, set_edit_index] = useState<number | null>(null);
  const [replace_index, set_replace_index] = useState<number | null>(null);
  const [staff_drink, set_staff_drink] = useState(false);
  const [discount, set_discount] = useState<pos_discount | null>(null);
  const [discount_open, set_discount_open] = useState(false);

  function open_confirm(_mode: 'order' | 'gift' = 'order') {
    set_confirm_open(true);
  }

  function close_confirm() {
    set_confirm_open(false);
  }

  useEffect(() => {
    on_nav_depth?.(step === 'products');
  }, [step, on_nav_depth]);

  useEffect(() => {
    function apply(store: ReturnType<typeof get_menu_store>) {
      const available = normalize_menu_item_images(store.items.filter((i) => i.is_available));
      set_items(available);
      const from_menu = (store.categories.length ? store.categories : default_categories).filter(
        (c) => available.some((i) => item_in_category(i, c))
      );
      set_categories(from_menu.length ? from_menu : store.categories);
      warm_menu_image_cache(available);
    }
    apply(get_menu_store());
    const unsub = subscribe_menu_store(() => apply(get_menu_store()));
    void fetch('/api/menu', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { store?: ReturnType<typeof get_menu_store> | null }) => {
        if (body.store?.items?.length) apply(body.store);
      })
      .catch(() => {});
    return unsub;
  }, []);


  const lookup_seq = useRef(0);
  const skip_phone_lookup = useRef(false);

  const lookup_guest = useCallback(async (opts: { code?: string | null; phone_e164?: string | null }) => {
    const seq = ++lookup_seq.current;
    const code = opts.code ? parse_pickup_code_input(opts.code) : null;
    const e164 = opts.phone_e164 || null;

    if (!code && !e164) {
      if (seq !== lookup_seq.current) return;
      set_customer(null);
      set_confirm_student(false);
      set_lookup_gifts([]);
      set_active_pickup_code(null);
      return;
    }

    set_lookup_busy(true);
    try {
      if (code) {
        const orders_res = await fetch(
          `/api/seller/orders?code=${encodeURIComponent(code)}`,
          { credentials: 'same-origin' }
        );
        const orders_body = await read_json_response<{
          customer?: found_customer | null;
          phone?: string | null;
          error?: string;
        }>(orders_res);
        const gifts_res = await fetch(
          `/api/seller/gifts?code=${encodeURIComponent(code)}`,
          { credentials: 'same-origin' }
        );
        const gifts_body = await read_json_response<{ gifts?: gift[]; error?: string }>(
          gifts_res
        );

        if (seq !== lookup_seq.current) return;
        if (!orders_res.ok || !orders_body.customer) {
          set_customer(null);
          set_confirm_student(false);
          set_lookup_gifts([]);
          set_active_pickup_code(null);
          set_error(
            orders_body.error ||
              (orders_res.status === 403
                ? 'нет доступа кассира'
                : 'гость по коду не найден — пусть обновит «мой код»')
          );
          return;
        }
        set_error(null);
        set_customer(orders_body.customer);
        set_confirm_student(false);
        set_active_pickup_code(code);
        set_lookup_gifts(gifts_body.gifts || []);
        const phone = orders_body.customer.phone || orders_body.phone || null;
        if (phone) {
          skip_phone_lookup.current = true;
          set_phone_draft(e164_to_phone_draft(phone));
        }
        return;
      }

      if (!e164) return;
      const [orders_res, gifts_res] = await Promise.all([
        fetch(`/api/seller/orders?phone=${encodeURIComponent(e164)}`, {
          credentials: 'same-origin',
        }),
        fetch(`/api/seller/gifts?phone=${encodeURIComponent(e164)}`, {
          credentials: 'same-origin',
        }),
      ]);
      const orders_body = await read_json_response<{ customer?: found_customer | null }>(
        orders_res
      );
      const gifts_body = await read_json_response<{ gifts?: gift[] }>(gifts_res);
      if (seq !== lookup_seq.current) return;
      set_error(null);
      set_customer(orders_body.customer || null);
      set_confirm_student(false);
      set_lookup_gifts(gifts_body.gifts || []);
      set_active_pickup_code(null);
    } catch (e) {
      if (seq !== lookup_seq.current) return;
      set_customer(null);
      set_confirm_student(false);
      set_lookup_gifts([]);
      set_active_pickup_code(null);
      set_error(e instanceof Error ? e.message : 'ошибка поиска гостя');
    } finally {
      if (seq === lookup_seq.current) set_lookup_busy(false);
    }
  }, []);

  useEffect(() => {
    if (!confirm_open) return;
    const t = window.setTimeout(() => {
      if (skip_phone_lookup.current) {
        skip_phone_lookup.current = false;
        return;
      }
      const code = parse_pickup_code_input(code_draft);
      const e164 = phone_input_to_e164(phone_draft);
      if (code && active_pickup_code === code && customer) return;
      void lookup_guest({
        code: code ? code_draft : null,
        phone_e164: code ? null : e164,
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [phone_draft, code_draft, confirm_open, active_pickup_code, customer, lookup_guest]);

  const filtered = useMemo(() => {
    if (!category) return [];
    return items.filter((i) => item_in_category(i, category));
  }, [items, category]);

  // свайп в товарах всегда возвращает к категориям (не листает категории)
  const { viewport_ref, page_style, width: board_w, height: board_h } = use_page_swipe({
    index: 0,
    count: 1,
    enabled: step === 'products' && !sheet_open && !confirm_open,
    on_index: () => {},
    on_edge_back: () => {
      set_step('categories');
      set_category('');
    },
  });

  const apply_student =
    !staff_drink && (Boolean(customer?.student_verified) || confirm_student);
  const priced_lines = cart.map((line) => {
    const menu = items.find((i) => i.id === line.menu_id);
    return {
      unit: student_line_price(
        line.price,
        { category: menu?.category, menu_id: line.menu_id },
        apply_student
      ),
      qty: line.quantity,
    };
  });
  const total = cart_total_after_discount(priced_lines, discount, staff_drink);
  const bar_total = priced_lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const ticket_label = discount_label(discount, staff_drink);
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
    close_confirm();
    set_step('categories');
    set_category('');
  }

  function build_line(
    item: menu_item,
    qty: number,
    options?: { volume?: string; topping: number; temp?: 'cold' | 'hot' }
  ): cart_line {
    const volume = resolve_volume_id(item, options?.volume);
    const topping = options?.topping ?? 0;
    const temp = options?.temp;
    const unit = configured_unit_price(item, volume, topping);
    const name_bits = [item.name];
    if (volume) name_bits.push(`${volume}мл`);
    if (temp === 'cold') name_bits.push('холодный');
    if (temp === 'hot') name_bits.push('горячий');
    if (topping > 0) name_bits.push(`+топ.${topping}`);
    return {
      menu_id: item.id,
      name: name_bits.join(' '),
      price: unit,
      quantity: qty,
      volume,
      topping,
      ...(temp ? { temp } : {}),
    };
  }

  function add_configured(
    item: menu_item,
    qty: number,
    options?: { volume?: string; topping: number; temp?: 'cold' | 'hot' }
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
      open_confirm('order');
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

  function toggle_staff() {
    set_staff_drink((prev) => {
      const next = !prev;
      if (next) {
        set_discount(null);
        set_discount_open(false);
        set_pay_with_bonus(false);
        set_confirm_student(false);
      }
      return next;
    });
  }

  function toggle_line_discount(index: number) {
    set_discount((prev) => {
      if (!prev || prev.scope !== 'lines') return prev;
      const has = prev.lines.includes(index);
      return { ...prev, lines: has ? prev.lines.filter((i) => i !== index) : [...prev.lines, index] };
    });
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
      close_confirm();
      on_created();
    } catch {
      set_error('не удалось выдать подарок');
    } finally {
      set_gift_busy(null);
    }
  }

  async function submit() {
    if (!cart.length || busy) return;
    const phone = staff_drink ? '' : phone_input_to_e164(phone_draft);
    const pickup_code = staff_drink ? null : active_pickup_code || parse_pickup_code_input(code_draft);
    if (!staff_drink && phone_draft.trim() && !phone) {
      set_error('введите телефон полностью');
      return;
    }
    if (!staff_drink && code_draft.trim() && !pickup_code && !phone) {
      set_error('введите код из 6 цифр');
      return;
    }

    const can_bonus =
      !staff_drink &&
      (Boolean(phone) || Boolean(pickup_code)) &&
      customer != null &&
      customer.bonus_balance >= FREE_DRINK_BONUS_THRESHOLD;
    if (pay_with_bonus && !can_bonus) {
      set_error('нельзя списать бобаллы: нужен гость с балансом ≥ 250 бб');
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
          items: cart.map(({ menu_id, name, price, quantity, volume }) => ({
            menu_id,
            name,
            price,
            quantity,
            volume,
          })),
          customer_phone: staff_drink ? undefined : phone || undefined,
          pickup_code: staff_drink ? undefined : pickup_code || undefined,
          customer_name: staff_drink ? seller_name : customer?.name || undefined,
          seller_name,
          pickup_minutes: 10,
          is_paid: paid_now || pay_with_bonus,
          payment_type: pay_with_bonus ? 'bonus' : 'cash',
          redeem_bonus: pay_with_bonus && !staff_drink,
          staff: staff_drink,
          discount: staff_drink ? undefined : discount,
          confirm_student:
            !staff_drink &&
            confirm_student &&
            Boolean(customer) &&
            !customer?.student_verified,
        }),
      });
      if (!res.ok) {
        const body = await read_json_response<{ error?: string }>(res).catch(() => null);
        throw new Error(body?.error || 'не удалось создать заказ');
      }
      const created = await read_json_response<{
        order?: { id: string; total_price: number; items?: order_item[] };
        bonus_balance?: number;
      }>(res);
      const order = created.order;
      if (typeof created.bonus_balance === 'number' && customer) {
        set_customer({ ...customer, bonus_balance: created.bonus_balance });
      }

      if (paid_now && !pay_with_bonus && order) {
        const order_total =
          Number(order.total_price) || total;
        const items_summary =
          (order.items || cart)
            .map((i) => `${i.name} ×${i.quantity}`)
            .join('; ') || cart.map((l) => `${l.name} ×${l.quantity}`).join('; ');
        void fetch('/api/cash', {
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
        void fetch('/api/cash', {
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
      set_code_draft('');
      set_active_pickup_code(null);
      set_customer(null);
      set_confirm_student(false);
      set_paid_now(false);
      set_pay_with_bonus(false);
      set_staff_drink(false);
      set_discount(null);
      set_discount_open(false);
      close_confirm();
      set_step('categories');
      set_category('');
      on_created();
    } catch (e) {
      set_error(e instanceof Error ? e.message : 'ошибка');
    } finally {
      set_busy(false);
    }
  }

  const hide_paid_checkbox = !cart.length;

  const confirm_modal = confirm_open ? (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={() => close_confirm()}
      />
      <div className="relative w-full max-w-md">
        <button
          type="button"
          aria-label="закрыть"
          onClick={() => close_confirm()}
          className={FLOATING_CLOSE_BTN_CLASS}
        >
          {close_x()}
        </button>
        <div className="relative overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
          <h3 className="text-lg font-bold text-neutral-900">
            {staff_drink ? 'себе' : cart.length ? 'всё верно?' : 'выдача по номеру'}
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            {staff_drink
              ? 'скидка 50% · спишется со склада'
              : cart.length
                ? 'заказ уйдёт в работу'
                : 'код, телефон, бобаллы и подарки'}
          </p>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          <ul className="space-y-2">
            {cart.map((line, index) => {
              const marked = discount?.scope === 'lines' && discount.lines.includes(index);
              const charged = discounted_unit(priced_lines, index, discount, staff_drink) * line.quantity;
              return (
              <li
                key={`${line.menu_id}-${index}`}
                className={`flex items-start justify-between gap-2 text-sm ${
                  marked ? 'rounded-xl bg-accent/10 px-2 py-1 -mx-2' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="font-medium text-neutral-900 truncate text-left w-full"
                    onClick={() => {
                      if (discount?.scope === 'lines') toggle_line_discount(index);
                    }}
                  >
                    {line_label(line)}
                  </button>
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
                  {charged} ₽
                </span>
              </li>
              );
            })}
          </ul>

          <div className="rounded-2xl bg-white border border-neutral-200 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-neutral-500">
              {ticket_label
                ? ticket_label
                : apply_student
                  ? STUDENT_DISCOUNT_LABEL
                  : 'итого'}
            </span>
            <span className="text-xl font-bold tabular-nums text-neutral-900">
              {pay_with_bonus ? '0 ₽' : `${total} ₽`}
            </span>
          </div>

          {!staff_drink && customer && customer.bonus_balance >= FREE_DRINK_BONUS_THRESHOLD ? (
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
                списать {FREE_DRINK_BONUS_THRESHOLD} бб · напиток бесплатно
                <span className="mt-0.5 block font-medium text-neutral-600">
                  у гостя {customer.bonus_balance} бб
                </span>
              </span>
            </label>
          ) : !staff_drink && bonus_preview > 0 ? (
            <p className="text-xs text-neutral-500">
              начислим{' '}
              <span className="font-semibold tabular-nums text-accent">
                +{bonus_preview}
              </span>{' '}
              бобаллов
              {customer ? (
                <span className="text-neutral-400"> · сейчас {customer.bonus_balance} бб</span>
              ) : null}
            </p>
          ) : null}

          {!staff_drink ? (
            <>
          {customer ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
              <p className="text-sm font-semibold text-neutral-900">
                {customer.name || 'гость'}
              </p>
              {customer.phone ? (
                <p className="mt-0.5 text-xs text-neutral-500">
                  {format_phone_display(customer.phone)}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-neutral-400">телефон не указан в профиле</p>
              )}
              <p className="mt-2 text-sm tabular-nums text-neutral-800">
                <span className="font-semibold text-accent">{customer.bonus_balance}</span>
                <span className="text-neutral-500"> бобаллов</span>
              </p>
              {active_pickup_code ? (
                <p className="mt-1 text-xs font-semibold text-accent">
                  найден по коду {active_pickup_code}
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="block">
            <span className="text-xs text-neutral-500">код гостя (из приложения)</span>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code_draft}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    set_code_draft(digits);
                    set_active_pickup_code(null);
                    set_error(null);
                  }}
                  placeholder="123456"
                  className="w-full bg-transparent font-mono text-sm tracking-[0.2em] outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => set_scanner_open(true)}
                className="shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-semibold text-neutral-700"
              >
                QR
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-xs text-neutral-500">или телефон гостя</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2.5">
              <span className="text-sm text-neutral-400">+7</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone_draft}
                onChange={(e) => {
                  set_phone_draft(format_phone_input(e.target.value));
                  if (code_draft) {
                    set_code_draft('');
                    set_active_pickup_code(null);
                  }
                }}
                placeholder="900 000-00-00"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          {lookup_busy ? (
            <p className="text-xs text-neutral-400">ищем в базе…</p>
          ) : code_draft.length === 6 && !customer ? (
            <p className="text-xs text-accent">
              {error || 'гость по коду не найден — пусть обновит «мой код» в приложении'}
            </p>
          ) : null}

          {customer && !customer.student_verified ? (
            <label className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-3">
              <input
                type="checkbox"
                checked={confirm_student}
                onChange={(e) => set_confirm_student(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="min-w-0 text-xs font-semibold leading-snug text-accent">
                подтвердить студенческую скидку −30%
                <span className="mt-0.5 block font-medium text-neutral-600">
                  {customer.student_claimed
                    ? 'гость отметил «я студент» в профиле'
                    : 'скидка останется в карточке клиента'}
                </span>
              </span>
            </label>
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
            </>
          ) : null}

          {!hide_paid_checkbox ? (
            <div className="space-y-2">
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
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={staff_drink}
                  onChange={toggle_staff}
                  className="rounded"
                />
                себе −50%
              </label>
              {!staff_drink ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={discount_open}
                      onChange={(e) => {
                        const on = e.target.checked;
                        set_discount_open(on);
                        set_discount(
                          on
                            ? {
                                scope: discount?.scope ?? 'check',
                                kind: discount?.kind ?? 'pct',
                                value: 0,
                                lines: discount?.lines ?? [],
                              }
                            : null
                        );
                      }}
                      className="rounded"
                    />
                    скидка
                  </label>
                  {discount_open ? (
                    <>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="0"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-sm tabular-nums"
                        value={discount?.value ? discount.value : ''}
                        onChange={(e) =>
                          set_discount((prev) => ({
                            scope: prev?.scope ?? 'check',
                            kind: prev?.kind ?? 'pct',
                            value: Math.max(0, Number(e.target.value) || 0),
                            lines: prev?.lines ?? [],
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          set_discount((prev) => ({
                            scope: prev?.scope ?? 'check',
                            kind: 'pct',
                            value: prev?.value ?? 0,
                            lines: prev?.lines ?? [],
                          }))
                        }
                        className={`text-sm font-semibold ${
                          (discount?.kind ?? 'pct') === 'pct' ? 'text-neutral-900' : 'text-neutral-400'
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          set_discount((prev) => ({
                            scope: prev?.scope ?? 'check',
                            kind: 'rub',
                            value: prev?.value ?? 0,
                            lines: prev?.lines ?? [],
                          }))
                        }
                        className={`text-sm font-semibold ${
                          discount?.kind === 'rub' ? 'text-neutral-900' : 'text-neutral-400'
                        }`}
                      >
                        ₽
                      </button>
                      <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <input
                          type="checkbox"
                          checked={discount?.scope === 'lines'}
                          onChange={(e) =>
                            set_discount((prev) => ({
                              scope: e.target.checked ? 'lines' : 'check',
                              kind: prev?.kind ?? 'pct',
                              value: prev?.value ?? 0,
                              lines: prev?.lines ?? [],
                            }))
                          }
                          className="rounded"
                        />
                        на позиции
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}
              {discount_open && !staff_drink && discount?.scope === 'lines' ? (
                <p className="ml-6 text-[11px] text-neutral-400">нажмите позиции в чеке</p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-neutral-700">{error}</p> : null}
        </div>

        <div className="px-5 py-4 border-t border-neutral-100 flex gap-2">
          <button
            type="button"
            onClick={() => close_confirm()}
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
    </div>
  ) : null;

  const scanner_modal = createElement(pos_qr_scanner, {
    open: scanner_open,
    on_close: () => set_scanner_open(false),
    on_scan: (code: string) => {
      skip_phone_lookup.current = true;
      set_code_draft(code);
      set_active_pickup_code(code);
      set_error(null);
      void lookup_guest({ code });
    },
  });

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
          total: bar_total,
          on_work: () => open_confirm('order'),
        })}
        <button
          type="button"
          onClick={() => open_confirm('gift')}
          className="shrink-0 py-1 text-center text-xs font-medium text-neutral-500"
        >
          выдать подарок — код или телефон
        </button>
        {confirm_modal}
        {scanner_modal}
        {sheet}
      </div>
    );
  }

  const { cols: prod_cols, rows: prod_rows } = board_tile_grid(
    filtered.length || 1,
    Math.max(0, board_w - 8),
    Math.max(0, board_h - 48),
  );

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
        total: bar_total,
        on_work: () => open_confirm('order'),
      })}
      {confirm_modal}
      {scanner_modal}
      {sheet}
    </div>
  );
}
