'use client';

import { useEffect, useState } from 'react';
import type { order } from '@/lib/types';

type props = {
  order: order | null;
  seller_name: string;
  on_close: () => void;
  on_complete: (payment_method: 'cash' | 'card', amount_received?: number) => void | Promise<void>;
};

export default function cash_register_modal({
  order,
  seller_name,
  on_close,
  on_complete,
}: props) {
  const [method, set_method] = useState<'cash' | 'card' | null>(null);
  const [received, set_received] = useState('');
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    if (!order) {
      set_method(null);
      set_received('');
      set_busy(false);
    }
  }, [order]);

  if (!order) return null;

  const total = Number(order.total_price);
  const received_num = parseFloat(received.replace(',', '.')) || 0;
  const change = method === 'cash' ? Math.max(0, received_num - total) : 0;
  const can_confirm_cash = method === 'cash' && received_num >= total;

  async function confirm() {
    if (!method || busy) return;
    if (method === 'cash' && !can_confirm_cash) return;
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
          <h2 className="text-xl font-bold text-neutral-900">оплата</h2>
          <p className="text-xs text-neutral-500 mt-0.5">бариста: {seller_name}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl bg-neutral-100 px-5 py-4 text-center">
            <p className="text-xs uppercase tracking-wide text-neutral-500">к оплате</p>
            <p className="text-4xl font-bold font-mono tabular-nums mt-1 text-neutral-900">
              {total} ₽
            </p>
          </div>

          <ul className="rounded-xl bg-neutral-50 px-4 py-3 text-sm space-y-1.5 max-h-32 overflow-y-auto">
            {(order.items as order['items']).map((item, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-neutral-700">{item.name}</span>
                <span className="text-neutral-400 shrink-0">×{item.quantity}</span>
              </li>
            ))}
          </ul>

          {!method && (
            <div className="grid grid-cols-2 gap-3">
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
              disabled={method === 'cash' ? !can_confirm_cash || busy : busy}
              onClick={() => void confirm()}
              className="flex-[1.4] rounded-xl bg-neutral-900 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'проводим…' : 'провести'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
