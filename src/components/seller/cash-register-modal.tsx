'use client';

import { useEffect, useState } from 'react';
import type { order } from '@/lib/types';

type props = {
  order: order | null;
  seller_name: string;
  on_close: () => void;
  on_complete: (payment_method: 'cash' | 'card', amount_received?: number) => void;
};

export default function cash_register_modal({
  order,
  seller_name,
  on_close,
  on_complete,
}: props) {
  const [method, set_method] = useState<'cash' | 'card' | null>(null);
  const [received, set_received] = useState('');

  useEffect(() => {
    if (!order) {
      set_method(null);
      set_received('');
    }
  }, [order]);

  if (!order) return null;

  const total = Number(order.total_price);
  const received_num = parseFloat(received.replace(',', '.')) || 0;
  const change = method === 'cash' ? Math.max(0, received_num - total) : 0;
  const can_confirm_cash = method === 'cash' && received_num >= total;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="закрыть" className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={on_close} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.12)] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-surface bg-gradient-to-b from-accent/5 to-white">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 sm:hidden" />
          <h2 className="text-xl font-bold text-neutral-900">оплата</h2>
          <p className="text-xs text-neutral-500 mt-0.5">кассир: {seller_name}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-2xl bg-neutral-900 text-white px-5 py-4 text-center">
            <p className="text-xs uppercase tracking-wide text-white/60">к оплате</p>
            <p className="text-4xl font-bold font-mono tabular-nums mt-1">{total} ₽</p>
          </div>

          <ul className="rounded-xl bg-surface/80 px-4 py-3 text-sm space-y-1.5 max-h-32 overflow-y-auto">
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
                className="rounded-2xl border-2 border-surface bg-white py-5 text-sm font-semibold hover:border-accent/40 hover:bg-accent/5 transition"
              >
                наличные
              </button>
              <button
                type="button"
                onClick={() => set_method('card')}
                className="rounded-2xl border-2 border-surface bg-white py-5 text-sm font-semibold hover:border-highlight/40 hover:bg-highlight/5 transition"
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
                  className="mt-2 w-full rounded-2xl border-2 border-surface px-4 py-4 text-2xl font-mono tabular-nums text-center focus:border-accent focus:outline-none"
                />
              </label>
              {received_num > 0 && (
                <div className={`rounded-2xl px-4 py-4 text-center ${can_confirm_cash ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">сдача</p>
                  <p className={`text-3xl font-bold font-mono tabular-nums mt-1 ${can_confirm_cash ? 'text-emerald-700' : 'text-accent'}`}>
                    {can_confirm_cash ? `${change} ₽` : 'мало'}
                  </p>
                </div>
              )}
            </div>
          )}

          {method === 'card' && (
            <div className="rounded-2xl bg-highlight/10 border border-highlight/20 px-4 py-5 text-center">
              <p className="text-sm text-neutral-600">безналичная оплата</p>
              <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-highlight">{total} ₽</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-surface flex gap-2 bg-surface/30">
          {method ? (
            <button
              type="button"
              onClick={() => { set_method(null); set_received(''); }}
              className="flex-1 rounded-xl border border-surface bg-white py-3.5 text-sm font-medium"
            >
              назад
            </button>
          ) : (
            <button type="button" onClick={on_close} className="flex-1 rounded-xl border border-surface bg-white py-3.5 text-sm font-medium">
              отмена
            </button>
          )}
          {method && (
            <button
              type="button"
              disabled={method === 'cash' ? !can_confirm_cash : false}
              onClick={() => on_complete(method!, method === 'cash' ? received_num : undefined)}
              className="flex-[1.4] rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-40 shadow-[0_4px_14px_rgba(4,104,240,0.28)]"
            >
              провести
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
