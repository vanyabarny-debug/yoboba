'use client';

import { useState } from 'react';
import { format_order_number } from '@/lib/order-number';
import type { order, order_item } from '@/lib/types';

type line = {
  menu_id: string;
  name: string;
  quantity: string;
  price: string;
  volume?: string;
  kind?: order_item['kind'];
};

type props = {
  order: order | null;
  busy: boolean;
  error: string;
  on_close: () => void;
  on_save: (items: order_item[]) => void;
};

export default function order_revise_sheet({ order, busy, error, on_close, on_save }: props) {
  const [lines, set_lines] = useState<line[]>(() =>
    (order?.items || []).map((item) => ({
      menu_id: item.menu_id || '',
      name: item.name,
      quantity: String(item.quantity),
      price: String(item.price),
      volume: item.volume,
      kind: item.kind,
    }))
  );

  if (!order) return null;

  function save() {
    const items: order_item[] = lines.map((line) => ({
      menu_id: line.menu_id,
      name: line.name.trim(),
      quantity: Number(line.quantity),
      price: Number(line.price),
      ...(line.volume ? { volume: line.volume } : {}),
      ...(line.kind ? { kind: line.kind } : {}),
    }));
    on_save(items);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="закрыть" onClick={on_close} />
      <form
        className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="text-base font-semibold text-neutral-900">заказ №{format_order_number(order)}</h2>
        <p className="mt-1 text-xs text-neutral-400">бобаллы при правке не меняются</p>
        <div className="mt-4 space-y-2">
          {lines.map((line, i) => (
            <div key={`${order.id}-${i}`} className="flex items-center gap-1.5">
              <input
                value={line.name}
                aria-label="название"
                onChange={(e) =>
                  set_lines((prev) => prev.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)))
                }
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-highlight"
              />
              <input
                value={line.quantity}
                inputMode="numeric"
                aria-label="количество"
                onChange={(e) =>
                  set_lines((prev) =>
                    prev.map((row, idx) =>
                      idx === i ? { ...row, quantity: e.target.value.replace(/[^\d]/g, '') } : row
                    )
                  )
                }
                className="w-12 rounded-lg border border-neutral-200 px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
              />
              <input
                value={line.price}
                inputMode="numeric"
                aria-label="цена"
                onChange={(e) =>
                  set_lines((prev) =>
                    prev.map((row, idx) =>
                      idx === i ? { ...row, price: e.target.value.replace(/[^\d]/g, '') } : row
                    )
                  )
                }
                className="w-16 rounded-lg border border-neutral-200 px-1.5 py-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
              />
              <button
                type="button"
                aria-label="убрать позицию"
                onClick={() => set_lines((prev) => prev.filter((_, idx) => idx !== i))}
                className="px-1 text-lg text-neutral-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            set_lines((prev) => [...prev, { menu_id: '', name: '', quantity: '1', price: '0' }])
          }
          className="mt-3 text-xs font-medium text-neutral-500"
        >
          + позиция
        </button>
        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={busy || lines.length === 0}
            className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            {busy ? 'сохраняю...' : 'сохранить'}
          </button>
          <button
            type="button"
            onClick={on_close}
            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700"
          >
            отмена
          </button>
        </div>
      </form>
    </div>
  );
}
