'use client';

import { useEffect, useState } from 'react';
import type { order } from '@/lib/types';
import { format_order_number } from '@/lib/order-number';
import { get_topping_portion_price_value } from '@/lib/product-details';
import { FREE_DRINK_BONUS_THRESHOLD } from '@/lib/cart-summary';
import { normalize_phone } from '@/lib/phone';

type payment_method = 'cash' | 'card' | 'bonus';

type props = {
  order: order | null;
  seller_name: string;
  on_close: () => void;
  on_complete: (
    payment_method: payment_method,
    amount_received?: number
  ) => void | Promise<void>;
};

type line_view = {
  key: string;
  title: string;
  qty: number;
  topping_note?: string;
  topping_extra?: number;
};

function parse_item_lines(items: order['items']): line_view[] {
  const portion = get_topping_portion_price_value();
  return items.map((item, i) => {
    const raw = item.name || '';
    const m = raw.match(/^(.*?)(?:\s*\+топ\.?\s*(\d+)\s*)?$/i);
    const base = (m?.[1] || raw).replace(/\s*650мл\s*/i, ' ').trim();
    const topping_count = m?.[2] ? Number(m[2]) : 0;
    const has_650 = /650\s*мл/i.test(raw);
    const title_bits = [base || raw];
    if (has_650) title_bits.push('650 мл');

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
}: props) {
  const [method, set_method] = useState<payment_method | null>(null);
  const [received, set_received] = useState('');
  const [busy, set_busy] = useState(false);
  const [bonus_balance, set_bonus_balance] = useState<number | null>(null);
  const [bonus_lookup, set_bonus_lookup] = useState(false);

  useEffect(() => {
    if (!order) {
      set_method(null);
      set_received('');
      set_busy(false);
      set_bonus_balance(null);
      set_bonus_lookup(false);
      return;
    }

    const phone = normalize_phone(order.customer_phone);
    if (!phone) {
      set_bonus_balance(null);
      set_bonus_lookup(false);
      return;
    }

    let cancelled = false;
    set_bonus_lookup(true);
    const qs = new URLSearchParams({ phone });
    if (order.user_id) qs.set('user_id', order.user_id);
    void fetch(`/api/seller/orders?${qs}`, {
      credentials: 'same-origin',
    })
      .then((r) => r.json())
      .then((body: { customer?: { bonus_balance?: number } | null }) => {
        if (cancelled) return;
        const bal = body.customer?.bonus_balance;
        set_bonus_balance(typeof bal === 'number' ? bal : null);
      })
      .catch(() => {
        if (!cancelled) set_bonus_balance(null);
      })
      .finally(() => {
        if (!cancelled) set_bonus_lookup(false);
      });

    return () => {
      cancelled = true;
    };
  }, [order]);

  if (!order) return null;

  const total = Number(order.total_price);
  const received_num = parseFloat(received.replace(',', '.')) || 0;
  const change = method === 'cash' ? Math.max(0, received_num - total) : 0;
  const can_confirm_cash = method === 'cash' && received_num >= total;
  const can_bonus =
    bonus_balance != null && bonus_balance >= FREE_DRINK_BONUS_THRESHOLD;
  const order_no = format_order_number(order);
  const lines = parse_item_lines(order.items as order['items']);
  const has_phone = Boolean(normalize_phone(order.customer_phone));

  async function confirm() {
    if (!method || busy) return;
    if (method === 'cash' && !can_confirm_cash) return;
    if (method === 'bonus' && !can_bonus) return;
    set_busy(true);
    try {
      await on_complete(method, method === 'cash' ? received_num : undefined);
    } finally {
      set_busy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/40"
        onClick={on_close}
      />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-neutral-100">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
          <h2 className="text-xl font-bold text-neutral-900">оплата · № {order_no}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">бариста: {seller_name}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl bg-neutral-100 px-5 py-4 text-center">
            <p className="text-xs uppercase tracking-wide text-neutral-500">к оплате</p>
            <p className="text-4xl font-bold font-mono tabular-nums mt-1 text-neutral-900">
              {method === 'bonus' ? '0 ₽' : `${total} ₽`}
            </p>
            {method === 'bonus' ? (
              <p className="mt-1 text-xs font-semibold text-accent">
                спишем {FREE_DRINK_BONUS_THRESHOLD} бобабаллов
              </p>
            ) : null}
          </div>

          <ul className="rounded-xl bg-neutral-50 px-4 py-3 text-sm space-y-2 max-h-40 overflow-y-auto">
            {lines.map((line) => (
              <li key={line.key} className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-neutral-800 truncate">{line.title}</p>
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
                <span className="text-neutral-400 shrink-0">×{line.qty}</span>
              </li>
            ))}
          </ul>

          {has_phone ? (
            <p className="text-xs text-neutral-500">
              {bonus_lookup
                ? 'проверяем бобабаллы гостя…'
                : bonus_balance != null
                  ? can_bonus
                    ? `у гостя ${bonus_balance} бб — можно списать ${FREE_DRINK_BONUS_THRESHOLD} бб за напиток`
                    : `у гостя ${bonus_balance} бб — нужно ещё ${Math.max(0, FREE_DRINK_BONUS_THRESHOLD - bonus_balance)} бб`
                  : 'гость с этим телефоном не найден в базе'}
            </p>
          ) : (
            <p className="text-xs text-neutral-400">
              без телефона списать бобабаллы нельзя — укажите телефон при создании заказа
            </p>
          )}

          {!method && (
            <div className={`grid gap-3 ${can_bonus ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                type="button"
                onClick={() => set_method('cash')}
                className="rounded-2xl border border-neutral-200 bg-white py-5 text-sm font-semibold text-neutral-800"
              >
                наличные
              </button>
              <button
                type="button"
                onClick={() => set_method('card')}
                className="rounded-2xl border border-neutral-200 bg-white py-5 text-sm font-semibold text-neutral-800"
              >
                безнал
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
              <p className="text-sm text-neutral-600">безналичная оплата</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-neutral-900">
                {total} ₽
              </p>
            </div>
          )}

          {method === 'bonus' && (
            <div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-accent">оплата бобабаллами</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-neutral-900">
                −{FREE_DRINK_BONUS_THRESHOLD} бб
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                останется {(bonus_balance ?? 0) - FREE_DRINK_BONUS_THRESHOLD} бб
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
                method === 'cash'
                  ? !can_confirm_cash || busy
                  : method === 'bonus'
                    ? !can_bonus || busy
                    : busy
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
  );
}
