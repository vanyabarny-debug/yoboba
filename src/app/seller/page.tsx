'use client';

import { BRAND_COLOR_ACCENT, BRAND_NAME } from '@/lib/brand';

import { useCallback, useEffect, useState, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { format_order_number } from '@/lib/order-number';
import type { cash_transaction, order } from '@/lib/types';
import cash_register_modal from '@/components/seller/cash-register-modal';
import day_summary_panel from '@/components/seller/day-summary';

type tab = 'orders' | 'summary';

function timer_meta(pickup_time: string) {
  const diff = new Date(pickup_time).getTime() - Date.now();
  if (diff <= 0) {
    return { label: '00:00', urgent: true, subtitle: 'пора выдавать', progress: 100 };
  }
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const total_secs = mins * 60 + secs;
  const progress = Math.max(8, Math.min(100, 100 - (total_secs / 900) * 100));
  return {
    label: `${mins}:${secs.toString().padStart(2, '0')}`,
    urgent: total_secs < 180,
    subtitle: 'до выдачи',
    progress,
  };
}

function order_card({ order: o, on_pay }: { order: order; on_pay: (o: order) => void }) {
  const [meta, set_meta] = useState(timer_meta(o.pickup_time));

  useEffect(() => {
    const id = setInterval(() => set_meta(timer_meta(o.pickup_time)), 1000);
    return () => clearInterval(id);
  }, [o.pickup_time]);

  const item_count = (o.items as order['items']).reduce((s, i) => s + i.quantity, 0);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-0.5 ${
        meta.urgent ? 'border-accent/40 ring-2 ring-accent/15' : 'border-white'
      }`}
    >
      {meta.urgent && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-soft to-accent" />
      )}

      <div className="flex gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={meta.urgent ? BRAND_COLOR_ACCENT : '#111111'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${meta.progress} 100`}
            />
          </svg>
          <div className="text-center">
            <p className={`text-sm font-bold font-mono tabular-nums leading-none ${meta.urgent ? 'text-accent' : 'text-neutral-800'}`}>
              {meta.label}
            </p>
            <p className="text-[9px] text-neutral-400 mt-0.5">{meta.subtitle}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                заказ № {format_order_number(o)}
              </p>
              <p className="text-sm text-neutral-500">{item_count} поз. · без телефона</p>
            </div>
            <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase text-neutral-500">
              {o.status}
            </span>
          </div>

          <ul className="text-sm space-y-1 mb-3">
            {(o.items as order['items']).slice(0, 3).map((item, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{item.name}</span>
                <span className="text-neutral-400 shrink-0">×{item.quantity}</span>
              </li>
            ))}
            {(o.items as order['items']).length > 3 && (
              <li className="text-xs text-neutral-400">+ ещё {(o.items as order['items']).length - 3}</li>
            )}
          </ul>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-bold font-mono tabular-nums text-neutral-900">{o.total_price} ₽</p>
            <button
              type="button"
              onClick={() => on_pay(o)}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_4px_14px_rgba(4,104,240,0.3)] hover:brightness-105 transition"
            >
              касса
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function seller_board() {
  const router = useRouter();
  const [tab, set_tab] = useState<tab>('orders');
  const [orders, set_orders] = useState<order[]>([]);
  const [paying, set_paying] = useState<order | null>(null);
  const [seller_id, set_seller_id] = useState('');
  const [seller_name, set_seller_name] = useState('продавец');
  const [creating_fake, set_creating_fake] = useState(false);

  const load = useCallback(async () => {
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
    const poll = window.setInterval(load, 4000);

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

  return (
    <div className="min-h-screen bg-[#f0f1f4]">
      <header className="sticky mobile-sticky-top z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{BRAND_NAME}</p>
              <h1 className="text-xl font-bold text-neutral-900">касса</h1>
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
            <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-white to-highlight/10 border border-white p-4 shadow-sm">
              <p className="text-sm font-medium text-neutral-800">тестовый заказ</p>
              <p className="text-xs text-neutral-500 mt-1 mb-3">
                без телефона — для проверки кассы и таймеров
              </p>
              <button
                type="button"
                disabled={creating_fake}
                onClick={create_fake_order}
                className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating_fake ? 'создаём...' : '+ фейк-заказ'}
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-6 py-14 text-center">
                <p className="text-base font-medium text-neutral-700">заказов пока нет</p>
                <p className="text-sm text-neutral-400 mt-2">
                  оформи с сайта или нажми «фейк-заказ»
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 px-1">
                  в очереди · {orders.length}
                </p>
                {orders.map((o) => createElement(order_card, { key: o.id, order: o, on_pay: set_paying }))}
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
