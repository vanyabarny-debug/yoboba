'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GuestLevelMark, type level_mark } from '@/components/guest-level-mark';
import { bills_icon, card_icon } from '@/components/pay-marks';
import { level_ink } from '@/lib/guest-rank';
import pos_qr_scanner from '@/components/seller/pos-qr-scanner';
import { calc_order_bonus, FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { gift_items_label } from '@/lib/gifts';
import { format_order_number } from '@/lib/order-number';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import { format_phone_display, format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { parse_pickup_code_input } from '@/lib/pickup-code';
import {
  cart_total_after_discount,
  discount_from_sold,
  discount_label,
  discounted_unit,
  type pos_discount,
} from '@/lib/pos-pricing';
import { get_topping_portion_price_value } from '@/lib/product-details';
import { read_json_response } from '@/lib/read-json-response';
import { STUDENT_DISCOUNT_LABEL, student_line_price } from '@/lib/student-discount';
import type { gift, order, order_item } from '@/lib/types';

type payment_method = 'cash' | 'card' | 'bonus';

export type cash_checkout = {
  method: payment_method;
  amount_received?: number;
  phone: string | null;
  customer_name: string | null;
  user_id: string | null;
  confirm_student: boolean;
  staff: boolean;
  items: order_item[];
  total: number;
};

type found_customer = {
  id: string;
  name: string | null;
  phone: string | null;
  bonus_balance: number;
  student_claimed?: boolean;
  student_verified?: boolean;
  level?: level_mark | null;
};

type props = {
  order: order | null;
  seller_name: string;
  on_close: () => void;
  on_complete: (checkout: cash_checkout) => void | Promise<void>;
  on_gift_redeemed?: () => void;
};

type line_view = {
  key: string;
  title: string;
  qty: number;
  topping_note?: string;
  topping_extra?: number;
};

function e164_to_phone_draft(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const local =
    digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
      ? digits.slice(1)
      : digits.slice(-10);
  return format_phone_input(local);
}

function parse_item_lines(items: order['items']): line_view[] {
  const portion = get_topping_portion_price_value();
  return items.map((item, i) => {
    const raw = item.name || '';
    const topping_m = raw.match(/\+топ\.?\s*(\d+)/i);
    const topping_count = topping_m?.[1] ? Number(topping_m[1]) : 0;
    const without_topping = raw.replace(/\s*\+топ\.?\s*\d+\s*/gi, ' ').trim();
    const normalized = normalize_order_item_fields({
      name: without_topping,
      volume: item.volume,
    });
    const title_bits = [normalized.name];
    if (normalized.volume) title_bits.push(`${normalized.volume} мл`);

    return {
      key: `${item.menu_id}-${i}`,
      title: title_bits.join(' · '),
      qty: item.quantity,
      topping_note: topping_count > 0 ? `топпинг ×${topping_count}` : undefined,
      topping_extra: topping_count > 0 ? topping_count * portion * item.quantity : undefined,
    };
  });
}

export default function cash_register_modal({
  order,
  seller_name,
  on_close,
  on_complete,
  on_gift_redeemed,
}: props) {
  const [method, set_method] = useState<payment_method | null>(null);
  const [received, set_received] = useState('');
  const [busy, set_busy] = useState(false);
  const [phone_draft, set_phone_draft] = useState('');
  const [code_draft, set_code_draft] = useState('');
  const [active_pickup_code, set_active_pickup_code] = useState<string | null>(null);
  const [scanner_open, set_scanner_open] = useState(false);
  const [customer, set_customer] = useState<found_customer | null>(null);
  const [lookup_gifts, set_lookup_gifts] = useState<gift[]>([]);
  const [gift_busy, set_gift_busy] = useState<string | null>(null);
  const [lookup_busy, set_lookup_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [confirm_student, set_confirm_student] = useState(false);
  const [staff_drink, set_staff_drink] = useState(false);
  const [discount, set_discount] = useState<pos_discount | null>(null);
  const [discount_open, set_discount_open] = useState(false);
  const [sold_draft, set_sold_draft] = useState('');
  const lookup_seq = useRef(0);
  const skip_phone_lookup = useRef(false);

  const order_id = order?.id ?? null;
  const order_phone_ref = useRef(order?.customer_phone);
  order_phone_ref.current = order?.customer_phone;

  useEffect(() => {
    set_method(null);
    set_received('');
    set_busy(false);
    set_code_draft('');
    set_active_pickup_code(null);
    set_scanner_open(false);
    set_customer(null);
    set_lookup_gifts([]);
    set_gift_busy(null);
    set_lookup_busy(false);
    set_error(null);
    set_confirm_student(false);
    set_staff_drink(false);
    set_discount(null);
    set_discount_open(false);
    set_sold_draft('');
    set_phone_draft(e164_to_phone_draft(order_phone_ref.current));
  }, [order_id]);

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
        const orders_res = await fetch(`/api/seller/orders?code=${encodeURIComponent(code)}`, {
          credentials: 'same-origin',
        });
        const orders_body = await read_json_response<{
          customer?: found_customer | null;
          phone?: string | null;
          error?: string;
        }>(orders_res);
        const gifts_res = await fetch(`/api/seller/gifts?code=${encodeURIComponent(code)}`, {
          credentials: 'same-origin',
        });
        const gifts_body = await read_json_response<{ gifts?: gift[] }>(gifts_res);
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
        fetch(`/api/seller/orders?phone=${encodeURIComponent(e164)}`, { credentials: 'same-origin' }),
        fetch(`/api/seller/gifts?phone=${encodeURIComponent(e164)}`, { credentials: 'same-origin' }),
      ]);
      const orders_body = await read_json_response<{ customer?: found_customer | null }>(orders_res);
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
    if (!order_id || staff_drink) return;
    const t = window.setTimeout(() => {
      if (skip_phone_lookup.current) {
        skip_phone_lookup.current = false;
        return;
      }
      const code = parse_pickup_code_input(code_draft);
      const e164 = phone_input_to_e164(phone_draft);
      if (customer && code && active_pickup_code === code) return;
      if (customer && !code && e164 && customer.phone === e164) return;
      void lookup_guest({
        code: code ? code_draft : null,
        phone_e164: code ? null : e164,
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [
    phone_draft,
    code_draft,
    order_id,
    staff_drink,
    active_pickup_code,
    customer,
    lookup_guest,
  ]);

  const items = useMemo(() => (order?.items || []) as order_item[], [order?.items]);
  const apply_student =
    !staff_drink && (Boolean(customer?.student_verified) || confirm_student);
  const priced_lines = useMemo(
    () =>
      items.map((item) => ({
        unit: student_line_price(
          Number(item.price) || 0,
          { menu_id: item.menu_id },
          apply_student
        ),
        qty: Math.max(0, Number(item.quantity) || 0),
      })),
    [items, apply_student]
  );
  const total = cart_total_after_discount(priced_lines, staff_drink ? null : discount, staff_drink);
  const bar_total = priced_lines.reduce((s, line) => s + line.unit * line.qty, 0);
  const ticket = discount_label(staff_drink ? null : discount, staff_drink);
  const bonus_preview = staff_drink
    ? 0
    : calc_order_bonus(items.map((item) => ({ menu_id: item.menu_id, quantity: item.quantity })));
  const can_bonus =
    !staff_drink &&
    customer != null &&
    customer.bonus_balance >= FREE_DRINK_BONUS_THRESHOLD &&
    Boolean(phone_input_to_e164(phone_draft) || active_pickup_code);

  const received_num = parseFloat(received.replace(',', '.')) || 0;
  const due = method === 'bonus' ? 0 : total;
  const change = method === 'cash' ? Math.max(0, received_num - due) : 0;
  const can_confirm_cash = method === 'cash' && received_num >= due;

  function toggle_staff() {
    set_staff_drink((prev) => {
      const next = !prev;
      if (next) {
        set_discount(null);
        set_discount_open(false);
        set_sold_draft('');
        set_confirm_student(false);
        if (method === 'bonus') set_method(null);
      }
      return next;
    });
  }

  function apply_sold_amount(raw: string, scope?: pos_discount['scope'], lines?: number[]) {
    const digits = raw.replace(/[^\d]/g, '');
    set_sold_draft(digits);
    const next_scope = scope ?? discount?.scope ?? 'check';
    const next_lines = lines ?? discount?.lines ?? [];
    if (!digits) {
      set_discount({ scope: next_scope, kind: 'rub', value: 0, lines: next_lines });
      return;
    }
    set_discount(
      discount_from_sold(priced_lines, Number(digits), { scope: next_scope, lines: next_lines }) || {
        scope: next_scope,
        kind: 'rub',
        value: 0,
        lines: next_lines,
      }
    );
  }

  function toggle_line_discount(index: number) {
    set_discount((prev) => {
      if (!prev || prev.scope !== 'lines') return prev;
      const has = prev.lines.includes(index);
      const lines = has ? prev.lines.filter((i) => i !== index) : [...prev.lines, index];
      if (sold_draft !== '') {
        return (
          discount_from_sold(priced_lines, Number(sold_draft) || 0, { scope: 'lines', lines }) || {
            ...prev,
            lines,
            value: 0,
          }
        );
      }
      return { ...prev, lines };
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
      on_gift_redeemed?.();
    } catch {
      set_error('не удалось выдать подарок');
    } finally {
      set_gift_busy(null);
    }
  }

  function charged_items(): order_item[] {
    return items.map((item, index) => ({
      ...item,
      price: discounted_unit(priced_lines, index, staff_drink ? null : discount, staff_drink),
      kind: staff_drink ? 'staff' : item.kind === 'staff' ? 'staff' : 'sale',
    }));
  }

  async function confirm() {
    if (!order || !method || busy) return;
    if (method === 'cash' && !can_confirm_cash) return;
    if (method === 'bonus' && !can_bonus) return;
    const phone = staff_drink ? null : phone_input_to_e164(phone_draft);
    const pickup_code = staff_drink ? null : active_pickup_code || parse_pickup_code_input(code_draft);
    if (!staff_drink && phone_draft.trim() && !phone) {
      set_error('введите телефон полностью');
      return;
    }
    if (!staff_drink && code_draft.trim() && !pickup_code && !phone) {
      set_error('введите код из 6 цифр');
      return;
    }
    set_busy(true);
    set_error(null);
    try {
      await on_complete({
        method,
        amount_received: method === 'cash' ? received_num : undefined,
        phone,
        customer_name: staff_drink ? seller_name : customer?.name || order.customer_name || null,
        user_id: staff_drink ? null : customer?.id || null,
        confirm_student:
          !staff_drink && confirm_student && Boolean(customer) && !customer?.student_verified,
        staff: staff_drink,
        items: charged_items(),
        total: method === 'bonus' ? 0 : total,
      });
    } finally {
      set_busy(false);
    }
  }

  if (!order) return null;

  const order_no = format_order_number(order);
  const lines = parse_item_lines(order.items as order['items']);

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <button
          type="button"
          aria-label="закрыть"
          className="absolute inset-0 bg-black/40"
          onClick={on_close}
        />
        <div className="relative flex max-h-[min(92vh,760px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
          <div className="px-6 pt-5 pb-4 border-b border-neutral-100">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
            <h2 className="text-xl font-bold text-neutral-900">оплата · № {order_no}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">бариста: {seller_name}</p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="rounded-2xl bg-neutral-100 px-5 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                {ticket || (apply_student ? STUDENT_DISCOUNT_LABEL : 'к оплате')}
              </p>
              <p className="text-4xl font-bold font-mono tabular-nums mt-1 text-neutral-900">
                {method === 'bonus' ? '0 ₽' : `${due} ₽`}
              </p>
              {method === 'bonus' ? (
                <p className="mt-1 text-xs font-semibold text-accent">
                  спишем {FREE_DRINK_BONUS_THRESHOLD} бобаллов
                </p>
              ) : ticket || apply_student ? (
                <p className="mt-1 text-xs text-neutral-500">по меню {bar_total} ₽</p>
              ) : null}
            </div>

            <ul className="rounded-xl bg-neutral-50 px-4 py-3 text-sm space-y-2 max-h-40 overflow-y-auto">
              {lines.map((line, index) => {
                const marked = !staff_drink && discount?.scope === 'lines' && discount.lines.includes(index);
                const charged = discounted_unit(priced_lines, index, staff_drink ? null : discount, staff_drink);
                return (
                  <li
                    key={line.key}
                    className={`flex justify-between gap-3 ${marked ? '-mx-2 rounded-xl bg-accent/10 px-2 py-1' : ''}`}
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="truncate text-left text-neutral-800"
                        onClick={() => {
                          if (discount?.scope === 'lines') toggle_line_discount(index);
                        }}
                      >
                        {line.title}
                      </button>
                      {line.topping_note ? (
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          {line.topping_note}
                          {line.topping_extra != null ? (
                            <span className="font-semibold text-neutral-700">
                              {' '}
                              · +{line.topping_extra} ₽
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 tabular-nums text-neutral-500">
                      ×{line.qty}
                      <span className="ml-2 font-semibold text-neutral-800">
                        {charged * line.qty} ₽
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {!staff_drink && can_bonus ? (
              <p className="text-xs font-semibold text-accent">
                у гостя {customer?.bonus_balance} бб — можно списать {FREE_DRINK_BONUS_THRESHOLD} бб за напиток
              </p>
            ) : !staff_drink && bonus_preview > 0 && (customer || phone_input_to_e164(phone_draft)) ? (
              <p className="text-xs text-neutral-500">
                начислим{' '}
                <span className="font-semibold tabular-nums text-accent">+{bonus_preview}</span> бобаллов
                {customer ? (
                  <span className="text-neutral-400"> · сейчас {customer.bonus_balance} бб</span>
                ) : null}
              </p>
            ) : null}

            {!staff_drink ? (
              <>
                {customer ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                    <p
                      className="text-sm"
                      style={{
                        color: customer.level ? level_ink(customer.level) : '#171717',
                        fontWeight: customer.level?.weight || 600,
                      }}
                      title={customer.level?.who}
                    >
                      {customer.name || 'гость'}
                      {customer.level ? (
                        <span className="ml-1.5">
                          <GuestLevelMark level={customer.level} />
                        </span>
                      ) : null}
                    </p>
                    {customer.phone ? (
                      <p className="mt-0.5 text-xs text-neutral-500">{format_phone_display(customer.phone)}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-neutral-400">телефон не указан в профиле</p>
                    )}
                    <p className="mt-2 text-sm tabular-nums text-neutral-800">
                      <span className="font-semibold text-accent">{customer.bonus_balance}</span>
                      <span className="text-neutral-500"> бобаллов</span>
                    </p>
                    {active_pickup_code ? (
                      <p className="mt-1 text-xs font-semibold text-accent">найден по коду {active_pickup_code}</p>
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
                  {customer ? (
                    <p
                      className="mt-1.5 text-sm"
                      style={{
                        color: customer.level ? level_ink(customer.level) : '#171717',
                        fontWeight: customer.level?.weight || 600,
                      }}
                      title={customer.level?.who}
                    >
                      {customer.name || 'гость'}
                      {customer.level ? (
                        <span className="ml-1.5">
                          <GuestLevelMark level={customer.level} />
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </label>

                {lookup_busy ? (
                  <p className="text-xs text-neutral-400">ищем в базе…</p>
                ) : code_draft.length === 6 && !customer ? (
                  <p className="text-xs text-accent">
                    {error || 'гость по коду не найден — пусть обновит «мой код» в приложении'}
                  </p>
                ) : phone_input_to_e164(phone_draft) && !customer && !lookup_busy ? (
                  <p className="text-xs text-neutral-400">
                    гостя с этим телефоном ещё нет — при оплате создадим карточку и начислим бобаллы
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
                          <p className="text-xs font-semibold text-neutral-800">{gift_items_label(g.items)}</p>
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

            <div className="space-y-2 text-sm text-neutral-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={staff_drink} onChange={toggle_staff} className="rounded" />
                себе −50%
              </label>
              {!staff_drink ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={discount_open}
                      onChange={(e) => {
                        const on = e.target.checked;
                        set_discount_open(on);
                        if (on) {
                          set_sold_draft(String(bar_total || ''));
                          set_discount({ scope: 'check', kind: 'rub', value: 0, lines: [] });
                        } else {
                          set_discount(null);
                          set_sold_draft('');
                        }
                      }}
                      className="rounded"
                    />
                    другая сумма
                  </label>
                  {discount_open ? (
                    <div className="ml-6 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs text-neutral-500">
                          по меню {bar_total.toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="text-neutral-300">·</span>
                        <label className="flex items-center gap-1.5">
                          <span className="text-xs text-neutral-500">продано за</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder={String(bar_total || 0)}
                            className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm tabular-nums"
                            value={sold_draft}
                            onChange={(e) => apply_sold_amount(e.target.value)}
                          />
                          <span className="text-xs text-neutral-500">₽</span>
                        </label>
                      </div>
                      {discount && discount.value > 0 ? (
                        <p className="text-xs text-amber-700">
                          скидка {(bar_total - total).toLocaleString('ru-RU')} ₽ автоматически
                        </p>
                      ) : (
                        <p className="text-[11px] text-neutral-400">
                          введите сумму продажи — скидка посчитается сама
                        </p>
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <input
                          type="checkbox"
                          checked={discount?.scope === 'lines'}
                          onChange={(e) => {
                            const on_lines = e.target.checked;
                            const scope = on_lines ? 'lines' : 'check';
                            const selected = on_lines ? discount?.lines ?? [] : [];
                            if (sold_draft !== '') apply_sold_amount(sold_draft, scope, selected);
                            else set_discount({ scope, kind: 'rub', value: 0, lines: selected });
                          }}
                          className="rounded"
                        />
                        только на отмеченные позиции
                      </label>
                      {discount?.scope === 'lines' ? (
                        <p className="text-[11px] text-neutral-400">нажмите позиции в чеке</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error && !(code_draft.length === 6 && !customer) ? (
              <p className="text-sm text-neutral-700">{error}</p>
            ) : null}

            {!method && (
              <div className={`grid gap-3 ${can_bonus ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => set_method('cash')}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 py-5 text-sm font-semibold text-neutral-800"
                >
                  {bills_icon({ className: 'h-10 w-10' })}
                  наличные
                </button>
                <button
                  type="button"
                  onClick={() => set_method('card')}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 py-5 text-sm font-semibold text-neutral-800"
                >
                  {card_icon({ className: 'h-10 w-10' })}
                  карта
                </button>
                {can_bonus ? (
                  <button
                    type="button"
                    onClick={() => set_method('bonus')}
                    className="rounded-2xl border border-accent/40 bg-accent/10 py-5 text-sm font-semibold text-accent"
                  >
                    бб
                  </button>
                ) : null}
              </div>
            )}

            {method === 'cash' && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">сколько дали</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => set_received(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-4 text-2xl font-mono tabular-nums text-center focus:border-neutral-400 focus:outline-none"
                  />
                </label>
                {received_num > 0 && (
                  <div className="rounded-2xl bg-neutral-50 px-4 py-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">сдача</p>
                    <p className="text-3xl font-bold font-mono tabular-nums mt-1 text-neutral-900">
                      {can_confirm_cash ? `${change} ₽` : 'мало'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {method === 'card' && (
              <div className="rounded-2xl bg-neutral-50 border border-neutral-100 px-4 py-5 text-center">
                <p className="text-sm text-neutral-600">оплата картой</p>
                <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-neutral-900">{due} ₽</p>
              </div>
            )}

            {method === 'bonus' && (
              <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-5 text-center">
                <p className="text-sm font-semibold text-accent">оплата бобаллами</p>
                <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-neutral-900">
                  −{FREE_DRINK_BONUS_THRESHOLD} бб
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  останется {(customer?.bonus_balance ?? 0) - FREE_DRINK_BONUS_THRESHOLD} бб
                </p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-neutral-100 flex gap-2">
            {method ? (
              <button
                type="button"
                onClick={() => {
                  set_method(null);
                  set_received('');
                }}
                className="flex-1 rounded-xl border border-neutral-200 bg-white py-3.5 text-sm font-medium"
              >
                назад
              </button>
            ) : (
              <button
                type="button"
                onClick={on_close}
                className="flex-1 rounded-xl border border-neutral-200 bg-white py-3.5 text-sm font-medium"
              >
                отмена
              </button>
            )}
            {method && (
              <button
                type="button"
                disabled={
                  method === 'cash' ? !can_confirm_cash || busy : method === 'bonus' ? !can_bonus || busy : busy
                }
                onClick={() => void confirm()}
                className="flex-[1.4] rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? 'проводим…' : method === 'bonus' ? 'списать' : 'провести'}
              </button>
            )}
          </div>
        </div>
      </div>
      {createElement(pos_qr_scanner, {
        open: scanner_open,
        on_close: () => set_scanner_open(false),
        on_scan: (code: string) => {
          skip_phone_lookup.current = true;
          set_code_draft(code);
          set_active_pickup_code(code);
          set_error(null);
          void lookup_guest({ code });
        },
      })}
    </>
  );
}
