'use client';

import { BRAND_NAME } from '@/lib/brand';
import { useCallback, useEffect, useState, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { format_order_number } from '@/lib/order-number';
import { format_countdown_ms } from '@/lib/kitchen-queue';
import { get_active_spots, get_spots } from '@/lib/spot-store';
import type { cash_transaction, order, store_spot } from '@/lib/types';
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

type seller_shift = {
  spot_id: string;
  address: string;
  city: string;
  opened_at: string;
};

const shift_key = 'yoboba_seller_shift';

function load_shift(): seller_shift | null {
  try {
    const raw = sessionStorage.getItem(shift_key);
    return raw ? (JSON.parse(raw) as seller_shift) : null;
  } catch {
    return null;
  }
}

function save_shift(shift: seller_shift) {
  sessionStorage.setItem(shift_key, JSON.stringify(shift));
}

function pickup_label(pickup_time: string) {
  return new Date(pickup_time).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function format_phone(phone?: string | null) {
  if (!phone) return 'нет телефона';
  return phone;
}

function order_card({
  order: o,
  lines,
  on_pay,
  on_hand_out,
}: {
  order: order;
  lines: schedule_line[];
  on_pay: (o: order) => void;
  on_hand_out: (o: order) => void;
}) {
  const [now, set_now] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pickup_ms = new Date(o.pickup_time).getTime();
  const until_pickup = Math.max(0, pickup_ms - now);
  const urgent = until_pickup < 3 * 60_000;
  const paid = Boolean(o.is_paid);

  return (
    <article
      className={`rounded-2xl border bg-white overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.05)] ${
        urgent ? 'border-accent/30' : 'border-neutral-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-neutral-100">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            № {format_order_number(o)}
          </p>
          <p className="text-base font-bold text-neutral-900 truncate">
            {o.customer_name || 'гость'}
          </p>
          <p className="text-xs text-neutral-500 tabular-nums">{format_phone(o.customer_phone)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold tabular-nums text-neutral-900">{pickup_label(o.pickup_time)}</p>
          <p
            className={`text-sm font-mono font-bold tabular-nums ${
              urgent ? 'text-accent' : 'text-neutral-600'
            }`}
          >
            {format_countdown_ms(until_pickup)}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {paid ? 'оплачен' : 'не оплачен'}
          </span>
        </div>
      </div>

      <ul className="px-3 py-3 space-y-1.5">
        {lines.length > 0
          ? lines.map((line, i) => {
              const start = new Date(line.start_at).getTime();
              const end = new Date(line.end_at).getTime();
              let label = format_countdown_ms(Math.max(0, end - now));
              let hint = `${line.prep_minutes} мин`;
              let tone = 'bg-neutral-50 text-neutral-700';
              if (now < start) {
                label = format_countdown_ms(start - now);
                hint = 'до старта';
              } else if (now >= end) {
                label = '✓';
                hint = 'на выдаче';
                tone = 'bg-accent/10 text-accent';
              } else {
                tone = 'bg-neutral-900 text-white';
              }
              return (
                <li
                  key={`${line.menu_id}-${i}`}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${tone}`}
                >
                  <span className="truncate font-medium">{line.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono font-bold tabular-nums">{label}</span>
                    <span className="block text-[10px] opacity-70">{hint}</span>
                  </span>
                </li>
              );
            })
          : (o.items as order['items']).map((item, i) => (
              <li
                key={i}
                className="flex justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
              >
                <span className="truncate">{item.name}</span>
                <span className="text-neutral-400 shrink-0">×{item.quantity}</span>
              </li>
            ))}
      </ul>

      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-neutral-50/80">
        <p className="text-lg font-bold font-mono tabular-nums">{o.total_price} ₽</p>
        <div className="flex gap-2">
          {!paid && (
            <button
              type="button"
              onClick={() => on_pay(o)}
              className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground"
            >
              касса
            </button>
          )}
          <button
            type="button"
            onClick={() => on_hand_out(o)}
            className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-800"
          >
            выдан
          </button>
        </div>
      </div>
    </article>
  );
}

function shift_picker({
  spots,
  on_pick,
}: {
  spots: store_spot[];
  on_pick: (spot: store_spot) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-neutral-900">открыть смену</h2>
        <p className="text-sm text-neutral-500 mt-1 mb-4">выберите точку, на которой работаете</p>
        <ul className="space-y-2">
          {spots.map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                onClick={() => on_pick(spot)}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:border-accent/40 hover:bg-accent/5"
              >
                <p className="font-semibold text-neutral-900">{spot.address}</p>
                <p className="text-xs text-neutral-500 capitalize mt-0.5">
                  {spot.city}
                  {spot.label ? ` · ${spot.label}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function seller_board() {
  const router = useRouter();
  const [tab, set_tab] = useState<tab>('orders');
  const [orders, set_orders] = useState<order[]>([]);
  const [schedule_lines, set_schedule_lines] = useState<schedule_line[]>([]);
  const [paying, set_paying] = useState<order | null>(null);
  const [seller_id, set_seller_id] = useState('');
  const [seller_name, set_seller_name] = useState('бариста');
  const [shift, set_shift] = useState<seller_shift | null>(null);
  const [shift_spots, set_shift_spots] = useState<store_spot[]>([]);
  const [need_shift, set_need_shift] = useState(false);

  const load = useCallback(async () => {
    try {
      const sched_res = await fetch('/api/kitchen/schedule', { credentials: 'same-origin' });
      if (sched_res.ok) {
        const body = (await sched_res.json()) as {
          lines?: schedule_line[];
          orders?: order[];
        };
        set_schedule_lines(body.lines ?? []);
        if (body.orders) {
          set_orders(body.orders);
          return;
        }
      }
    } catch {
      /* fallback */
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

    const existing = load_shift();
    if (existing) {
      set_shift(existing);
      set_need_shift(false);
    } else {
      let allowed_ids: string[] = [];
      try {
        allowed_ids = JSON.parse(sessionStorage.getItem('yoboba_seller_spot_ids') || '[]') as string[];
      } catch {
        allowed_ids = [];
      }
      const all = get_active_spots();
      const available =
        allowed_ids.length > 0 ? all.filter((s) => allowed_ids.includes(s.id)) : all.length ? all : get_spots();
      set_shift_spots(available.length ? available : get_spots());
      set_need_shift(true);
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

  async function patch_order(id: string, patch: Partial<order>) {
    if (id.startsWith('demo-order')) {
      await fetch('/api/orders/demo', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, patch }),
      });
      return;
    }
    if (is_supabase_configured()) {
      const supabase = create_client();
      const { error } = await supabase.from('orders').update(patch).eq('id', id);
      if (error && /is_paid/i.test(error.message)) {
        const { is_paid: _paid, customer_name: _n, customer_phone: _p, ...rest } = patch;
        await supabase.from('orders').update(rest).eq('id', id);
      }
    }
  }

  async function complete_payment(payment_method: 'cash' | 'card', amount_received?: number) {
    if (!paying) return;
    const total = Number(paying.total_price);
    const change =
      payment_method === 'cash' && amount_received != null
        ? Math.max(0, amount_received - total)
        : null;

    const tx: cash_transaction = {
      id: `cash-${Date.now()}`,
      order_id: paying.id,
      seller_id,
      seller_name,
      order_total: total,
      payment_method,
      amount_received: payment_method === 'cash' ? amount_received ?? null : null,
      change_given: change,
      items_summary: (paying.items as order['items'])
        .map((i) => `${i.name} ×${i.quantity}`)
        .join('; '),
      shift_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };

    await fetch('/api/cash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tx),
    });

    await patch_order(paying.id, {
      is_paid: true,
      payment_type: payment_method,
      status: paying.status === 'ready' ? 'ready' : 'preparing',
    });

    set_paying(null);
    await load();
  }

  async function hand_out(o: order) {
    if (!confirm('точно выдали заказ?')) return;
    const next_status = o.status === 'ready' ? 'completed' : 'ready';
    await patch_order(o.id, { status: next_status });
    await load();
  }

  const lines_by_order = new Map<string, schedule_line[]>();
  for (const line of schedule_lines) {
    const list = lines_by_order.get(line.order_id) ?? [];
    list.push(line);
    lines_by_order.set(line.order_id, list);
  }

  const in_work = orders.filter((o) => o.status === 'new' || o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  return (
    <div className="min-h-screen bg-[#f0f1f4]">
      {need_shift &&
        createElement(shift_picker, {
          spots: shift_spots,
          on_pick: (spot) => {
            const next = {
              spot_id: spot.id,
              address: spot.address,
              city: spot.city,
              opened_at: new Date().toISOString(),
            };
            save_shift(next);
            set_shift(next);
            set_need_shift(false);
          },
        })}

      <header className="sticky mobile-sticky-top z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {BRAND_NAME}
              </p>
              <h1 className="text-xl font-bold text-neutral-900">
                бариста {seller_name}
              </h1>
              <p className="text-xs text-neutral-500 truncate">
                {shift ? shift.address : 'смена не открыта'}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                sessionStorage.removeItem(shift_key);
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

      <main className="max-w-3xl mx-auto px-4 py-5">
        {tab === 'orders' ? (
          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 px-1 mb-3">
                в работе · {in_work.length}
              </p>
              {in_work.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-center text-sm text-neutral-400">
                  пусто
                </div>
              ) : (
                <div className="space-y-3">
                  {in_work.map((o) =>
                    createElement(order_card, {
                      key: o.id,
                      order: o,
                      lines: lines_by_order.get(o.id) ?? [],
                      on_pay: set_paying,
                      on_hand_out: hand_out,
                    })
                  )}
                </div>
              )}
            </section>

            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 px-1 mb-3">
                готово · {ready.length}
              </p>
              {ready.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-10 text-center text-sm text-neutral-400">
                  пусто
                </div>
              ) : (
                <div className="space-y-3">
                  {ready.map((o) =>
                    createElement(order_card, {
                      key: o.id,
                      order: o,
                      lines: lines_by_order.get(o.id) ?? [],
                      on_pay: set_paying,
                      on_hand_out: hand_out,
                    })
                  )}
                </div>
              )}
            </section>
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
