'use client';

import { useState } from 'react';
import type { loose_order } from '@/lib/customer-link-server';

function when(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const pay: Record<loose_order['payment_type'], string> = {
  cash: 'нал',
  card: 'карта',
  online: 'онлайн',
  bonus: 'бобаллы',
};

/** привязать продажу, пробитую без гостя, к этому клиенту */
export default function LinkOrderPanel({
  customer,
  on_linked,
}: {
  customer: { id: string; name: string; phone: string | null };
  on_linked: (note: string) => void;
}) {
  const [open, set_open] = useState(false);
  const [orders, set_orders] = useState<loose_order[] | null>(null);
  const [days, set_days] = useState(7);
  const [earn, set_earn] = useState(true);
  const [busy, set_busy] = useState<string | null>(null);
  const [error, set_error] = useState('');
  const [q, set_q] = useState('');

  async function load(span = days) {
    set_error('');
    set_orders(null);
    try {
      const res = await fetch(`/api/admin/customers/link?days=${span}`, { credentials: 'same-origin' });
      const body = (await res.json()) as { orders?: loose_order[]; error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось загрузить продажи');
        set_orders([]);
        return;
      }
      set_orders(body.orders || []);
    } catch {
      set_error('не удалось загрузить продажи');
      set_orders([]);
    }
  }

  async function link(o: loose_order) {
    if (busy) return;
    set_busy(o.id);
    set_error('');
    try {
      const res = await fetch('/api/admin/customers/link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: o.id,
          customer_id: customer.id,
          phone: customer.phone,
          name: customer.name,
          earn,
        }),
      });
      const body = (await res.json()) as { error?: string; earned?: number; bonus_note?: string | null };
      if (!res.ok) {
        set_error(body.error || 'не удалось привязать');
        return;
      }
      set_orders((prev) => (prev ? prev.filter((row) => row.id !== o.id) : prev));
      const note = body.earned
        ? `${o.label} привязан · +${body.earned} бобаллов`
        : `${o.label} привязан${body.bonus_note ? ` · ${body.bonus_note}` : ''}`;
      on_linked(note);
    } catch {
      set_error('не удалось привязать');
    } finally {
      set_busy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          set_open(true);
          void load();
        }}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
      >
        + привязать покупку без гостя
      </button>
    );
  }

  const query = q.trim().toLowerCase();
  const visible = (orders || []).filter(
    (o) => !query || `${o.title} ${o.label} ${o.total_price}`.toLowerCase().includes(query)
  );

  return (
    <div data-stop-collapse className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-800">продажи без гостя</p>
        <button type="button" onClick={() => set_open(false)} className="text-xs font-medium text-neutral-500">
          закрыть
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              set_days(d);
              void load(d);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              days === d ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {d === 1 ? 'сутки' : `${d} дней`}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-neutral-600">
          <input type="checkbox" checked={earn} onChange={(e) => set_earn(e.target.checked)} className="rounded" />
          начислить бобаллы
        </label>
      </div>
      <input
        value={q}
        onChange={(e) => set_q(e.target.value)}
        placeholder="напиток или сумма"
        className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
      />
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {orders === null ? <p className="text-xs text-neutral-400">загрузка…</p> : null}
      {orders && visible.length === 0 ? <p className="text-xs text-neutral-400">нет продаж без гостя</p> : null}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {visible.map((o) => (
          <li key={o.id} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-neutral-800">{o.title}</p>
              <p className="text-[11px] text-neutral-400">
                {when(o.created_at)} · {o.label} · {pay[o.payment_type]}
                {o.is_paid ? '' : ' · не оплачен'}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-900">
              {Math.round(o.total_price).toLocaleString('ru-RU')} ₽
            </span>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void link(o)}
              className="shrink-0 rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {busy === o.id ? '…' : 'это он'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
