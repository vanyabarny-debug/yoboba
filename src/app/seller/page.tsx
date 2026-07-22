'use client';

import { BRAND_NAME } from '@/lib/brand';

import { useCallback, useEffect, useState, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { format_order_number } from '@/lib/order-number';
import { format_countdown_ms } from '@/lib/kitchen-queue';
import type { cash_transaction, order } from '@/lib/types';
import cash_register_modal from '@/components/seller/cash-register-modal';
import day_summary_panel from '@/components/seller/day-summary';

type tab = 'orders' | 'summary';

type schedule_line = {
  order_id: string;
  menu_id: string;
  name: string;
  category: string;
  prep_minutes: number;
  start_at: string;
  end_at: string;
  pickup_at: string;
};

function pickup_label(pickup_time: string) {
  return new Date(pickup_time).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function line_timer_state(line: schedule_line, now: number) {
  const start = new Date(line.start_at).getTime();
  const end = new Date(line.end_at).getTime();

  if (now < start) {
    return {
      phase: 'wait' as const,
      label: format_countdown_ms(start - now),
      hint: 'до старта',
      urgent: false,
    };
  }
  if (now < end) {
    return {
      phase: 'prep' as const,
      label: format_countdown_ms(end - now),
      hint: `${line.prep_minutes} мин`,
      urgent: end - now < 90_000,
    };
  }
  return {
    phase: 'done' as const,
    label: '✓',
    hint: 'на выдаче',
    urgent: true,
  };
}

function kitchen_line_row({ line }: { line: schedule_line }) {
  const [now, set_now] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = line_timer_state(line, now);

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
        state.phase === 'prep'
          ? 'bg-neutral-900 text-white'
          : state.phase === 'done'
            ? 'bg-accent/10 text-accent'
            : 'bg-neutral-50 text-neutral-700'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{line.name}</p>
        <p className="text-[10px] opacity-70">{line.category}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-mono tabular-nums font-bold ${state.urgent ? 'text-accent' : ''}`}>
          {state.label}
        </p>
        <p className="text-[10px] opacity-70">{state.hint}</p>
      </div>
    </li>
  );
}

function order_card({
  order: o,
  lines,
  on_pay,
}: {
  order: order;
  lines: schedule_line[];
  on_pay: (o: order) => void;
}) {
  const [now, set_now] = useState(Date.now());
  const order_lines = lines.length ? lines : [];

  useEffect(() => {
    const id = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pickup_ms = new Date(o.pickup_time).getTime();
  const until_pickup = Math.max(0, pickup_ms - now);
  const urgent = until_pickup < 3 * 60_000;

  return (
    <article
      className={`rounded-2xl border bg-white overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.05)] ${
        urgent ? 'border-accent/30' : 'border-neutral-100'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            № {format_order_number(o)}
          </p>
          <p className="text-lg font-bold text-neutral-900 tabular-nums">
            {pickup_label(o.pickup_time)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`text-xl font-mono font-bold tabular-nums ${
              urgent ? 'text-accent' : 'text-neutral-800'
            }`}
          >
            {format_countdown_ms(until_pickup)}
          </p>
          <p className="text-[10px] text-neutral-400">до выдачи</p>
        </div>
      </div>

      <ul className="px-3 py-3 space-y-1.5">
        {order_lines.length > 0 ? (
          order_lines.map((line, i) => createElement(kitchen_line_row, { key: `${line.menu_id}-${i}`, line }))
        ) : (
          (o.items as order['items']).map((item, i) => (
            <li
              key={i}
              className="flex justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
            >
              <span className="truncate">{item.name}</span>
              <span className="text-neutral-400 shrink-0">×{item.quantity}</span>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-neutral-50/80">
        <p className="text-lg font-bold font-mono tabular-nums">{o.total_price} ₽</p>
        <button
          type="button"
          onClick={() => on_pay(o)}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          касса
        </button>
      </div>
    </article>
  );
}

export default function seller_board() {
  const router = useRouter();
  const [tab, set_tab] = useState<tab>('orders');
  const [orders, set_orders] = useState<order[]>([]);
  const [schedule_lines, set_schedule_lines] = useState<schedule_line[]>([]);
  const [paying, set_paying] = useState<order | null>(null);
  const [seller_id, set_seller_id] = useState('');
  const [seller_name, set_seller_name] = useState('продавец');
  const [creating_fake, set_creating_fake] = useState(false);

  const load = useCallback(async () => {
    try {
      const sched_res = await fetch('/api/kitchen/schedule', { credentials: 'same-origin' });
      if (sched_res.ok) {
        const body = (await sched_res.json()) as {
          lines?: schedule_line[];
          orders?: order[];
        };
        set_schedule_lines(body.lines ?? []);
        if (body.orders?.length) {
          set_orders(body.orders);
          return;
        }
      }
    } catch {
      /* fallback below */
    }

    const merged: order[] = [];
    const seen = new Set<string>();

    try {
      const demo_res = await fetch('/api/orders/demo');
      if (demo_res.ok) {
        const demo_data = (await demo_res.json()) as { orders: order[] };
        for (const o of demo_data.orders || []) {
          if (!seen.has(o.id)) {
            seen.add(o.id);
            merged.push(o);
          }
        }
      }
    } catch {
      /* offline */
    }

    if (is_supabase_configured()) {
      const supabase = create_client();
      const { data } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['new', 'preparing', 'ready'])
        .order('pickup_time', { ascending: true });
      for (const o of (data as order[]) || []) {
        if (!seen.has(o.id)) {
          seen.add(o.id);
          merged.push(o);
        }
      }
    }

    merged.sort(
      (a, b) => new Date(a.pickup_time).getTime() - new Date(b.pickup_time).getTime()
    );
    set_orders(merged);
  }, []);

  useEffect(() => {
    const user = get_demo_user();
    if (user) {
      set_seller_id(user.id);
      set_seller_name(user.name);
    }
    load();
    const poll = window.setInterval(load, 3000);

    if (is_supabase_configured()) {
      const supabase = create_client();
      const channel = supabase
        .channel('seller-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
        .subscribe();
      return () => {
        window.clearInterval(poll);
        supabase.removeChannel(channel);
      };
    }
    return () => window.clearInterval(poll);
  }, [load]);

  async function create_fake_order() {
    set_creating_fake(true);
    try {
      await fetch('/api/orders/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fake: true, pickup_minutes: 7 }),
      });
      await load();
    } finally {
      set_creating_fake(false);
    }
  }

  async function complete_payment(payment_method: 'cash' | 'card', amount_received?: number) {
    if (!paying) return;
    const total = Number(paying.total_price);
    const change = payment_method === 'cash' && amount_received != null ? Math.max(0, amount_received - total) : null;

    const tx: cash_transaction = {
      id: `cash-${Date.now()}`,
      order_id: paying.id,
      seller_id,
      seller_name,
      order_total: total,
      payment_method,
      amount_received: payment_method === 'cash' ? amount_received ?? null : null,
      change_given: change,
      items_summary: (paying.items as order['items']).map((i) => `${i.name} ×${i.quantity}`).join('; '),
      shift_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };

    await fetch('/api/cash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tx),
    });

    if (paying.id.startsWith('demo-order')) {
      await fetch('/api/orders/demo', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: paying.id,
          patch: { status: 'completed', payment_type: payment_method },
        }),
      });
    } else if (is_supabase_configured()) {
      const supabase = create_client();
      await supabase
        .from('orders')
        .update({ status: 'completed', payment_type: payment_method })
        .eq('id', paying.id);
    }

    await load();
    set_paying(null);
  }

  const lines_by_order = new Map<string, schedule_line[]>();
  for (const line of schedule_lines) {
    const list = lines_by_order.get(line.order_id) ?? [];
    list.push(line);
    lines_by_order.set(line.order_id, list);
  }

  return (
    <div className="min-h-screen bg-[#f0f1f4]">
      <header className="sticky mobile-sticky-top z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{BRAND_NAME}</p>
              <h1 className="text-xl font-bold text-neutral-900">кухня</h1>
              <p className="text-xs text-neutral-500">{seller_name}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await clear_session();
                router.push('/admin/login');
              }}
              className="rounded-xl border border-surface bg-white px-3 py-2 text-xs text-neutral-600"
            >
              выйти
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
            {(['orders', 'summary'] as tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set_tab(t)}
                className={`rounded-xl py-2.5 text-sm font-medium transition ${
                  tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                {t === 'orders' ? 'заказы' : 'итоги'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">
        {tab === 'orders' ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-neutral-100 p-4 shadow-sm">
              <p className="text-sm font-medium text-neutral-800">очередь бариста</p>
              <p className="text-xs text-neutral-500 mt-1 mb-3">
                таймеры по каждому напитку · газировка ближе к выдаче
              </p>
              <button
                type="button"
                disabled={creating_fake}
                onClick={create_fake_order}
                className="w-full rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-600 disabled:opacity-50"
              >
                {creating_fake ? 'создаём...' : '+ тестовый заказ'}
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-6 py-14 text-center">
                <p className="text-base font-medium text-neutral-700">заказов пока нет</p>
                <p className="text-sm text-neutral-400 mt-2">ждём гостей</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 px-1">
                  в работе · {orders.length}
                </p>
                {orders.map((o) =>
                  createElement(order_card, {
                    key: o.id,
                    order: o,
                    lines: lines_by_order.get(o.id) ?? [],
                    on_pay: set_paying,
                  })
                )}
              </div>
            )}
          </div>
        ) : (
          createElement(day_summary_panel)
        )}
      </main>

      {createElement(cash_register_modal, {
        order: paying,
        seller_name,
        on_close: () => set_paying(null),
        on_complete: complete_payment,
      })}
    </div>
  );
}
