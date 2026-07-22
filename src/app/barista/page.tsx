'use client';

import { useEffect, useState, useCallback, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { format_order_number } from '@/lib/order-number';
import type { order } from '@/lib/types';

const columns: { key: order['status']; label: string }[] = [
  { key: 'new', label: 'новые' },
  { key: 'preparing', label: 'готовятся' },
  { key: 'ready', label: 'ожидает выдачи' },
];

function countdown_label(pickup_time: string) {
  const diff = new Date(pickup_time).getTime() - Date.now();
  if (diff <= 0) return 'пора выдавать';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function order_card({
  order: o,
  on_status,
}: {
  order: order;
  on_status: (id: string, status: order['status']) => void;
}) {
  const [timer, set_timer] = useState(countdown_label(o.pickup_time));

  useEffect(() => {
    const id = setInterval(() => set_timer(countdown_label(o.pickup_time)), 1000);
    return () => clearInterval(id);
  }, [o.pickup_time]);

  const next_status: Record<string, order['status'] | null> = {
    new: 'preparing',
    preparing: 'ready',
    ready: 'completed',
  };

  const next = next_status[o.status];

  return (
    <article className="bg-white rounded-card border border-surface p-3 shadow-soft">
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-neutral-400">№ {format_order_number(o)}</span>
        <span
          className={`text-sm font-mono tabular-nums font-semibold ${
            timer === 'пора выдавать' ? 'text-accent' : 'text-neutral-700'
          }`}
        >
          {timer}
        </span>
      </div>
      <ul className="text-sm space-y-0.5 mb-2">
        {(o.items as order['items']).map((item, i) => (
          <li key={i} className="flex justify-between">
            <span>{item.name}</span>
            <span className="text-neutral-400">×{item.quantity}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-center text-sm">
        <span className="font-semibold font-mono tabular-nums">{o.total_price} ₽</span>
        <span className="text-xs text-neutral-500">{o.payment_type}</span>
      </div>
      {next && (
        <button
          type="button"
          onClick={() => on_status(o.id, next)}
          className="mt-3 w-full rounded-pill bg-brand-gradient text-neutral-800 py-2 text-xs font-medium"
        >
          → {columns.find((c) => c.key === next)?.label || next}
        </button>
      )}
    </article>
  );
}

export default function barista_board() {
  const [orders, set_orders] = useState<order[]>([]);

  const load = useCallback(async () => {
    const supabase = create_client();
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['new', 'preparing', 'ready'])
      .order('pickup_time', { ascending: true });
    set_orders((data as order[]) || []);
  }, []);

  useEffect(() => {
    load();
    const supabase = create_client();
    const channel = supabase
      .channel('barista-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function update_status(id: string, status: order['status']) {
    const supabase = create_client();
    await supabase.from('orders').update({ status }).eq('id', id);
    load();
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-page border-b border-surface sticky mobile-sticky-top z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-accent">бариста</h1>
          <p className="text-xs text-neutral-500">заказы к выдаче</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 grid md:grid-cols-3 gap-4">
        {columns.map((col) => (
          <section key={col.key} className="min-h-[60vh]">
            <h2 className="text-sm font-medium text-neutral-500 mb-3 px-1">
              {col.label}
            </h2>
            <div className="space-y-3">
              {orders
                .filter((o) => o.status === col.key)
                .map((o) =>
                  createElement(order_card, {
                    key: o.id,
                    order: o,
                    on_status: update_status,
                  })
                )}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
