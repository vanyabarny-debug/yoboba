'use client';

import { SQUAD_NAME } from '@/lib/brand';
import { useCallback, useEffect, useRef, useState, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { format_order_number } from '@/lib/order-number';
import { DEFAULT_PREP_MINUTES, format_countdown_ms } from '@/lib/kitchen-queue';
import { play_new_order_chime } from '@/lib/order-chime';
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

type drink_row = {
  key: string;
  name: string;
  prep_minutes: number;
};

type prep_state = {
  started_at: number | null;
  done: boolean;
};

type seller_shift = {
  spot_id: string;
  address: string;
  city: string;
  opened_at: string;
};

const shift_key = 'yoboba_seller_shift';
const prep_key = 'yoboba_seller_prep';

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

function load_prep_map(): Record<string, Record<string, prep_state>> {
  try {
    return JSON.parse(sessionStorage.getItem(prep_key) || '{}') as Record<
      string,
      Record<string, prep_state>
    >;
  } catch {
    return {};
  }
}

function save_prep_map(map: Record<string, Record<string, prep_state>>) {
  sessionStorage.setItem(prep_key, JSON.stringify(map));
}

function pickup_label(pickup_time: string) {
  return new Date(pickup_time).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function format_phone(phone?: string | null) {
  const p = (phone || '').trim();
  return p || null;
}

function customer_label(o: order) {
  const name = (o.customer_name || '').trim();
  return name || 'гость';
}

function expand_drinks(o: order, lines: schedule_line[]): drink_row[] {
  if (lines.length) {
    return lines.map((l, i) => ({
      key: `${l.menu_id}-${i}`,
      name: l.name,
      prep_minutes: l.prep_minutes || DEFAULT_PREP_MINUTES,
    }));
  }
  const rows: drink_row[] = [];
  for (const item of o.items as order['items']) {
    for (let q = 0; q < item.quantity; q++) {
      rows.push({
        key: `${item.menu_id}-${q}`,
        name: item.name,
        prep_minutes: DEFAULT_PREP_MINUTES,
      });
    }
  }
  return rows;
}

function order_card({
  order: o,
  lines,
  is_new,
  prep,
  on_pay,
  on_start_drink,
  on_mark_drink_done,
  on_hand_out,
}: {
  order: order;
  lines: schedule_line[];
  is_new: boolean;
  prep: Record<string, prep_state>;
  on_pay: (o: order) => void;
  on_start_drink: (order_id: string, drink_key: string, prep_minutes: number) => void;
  on_mark_drink_done: (order_id: string, drink_key: string) => void;
  on_hand_out: (o: order) => void;
}) {
  const [now, set_now] = useState(Date.now());
  const drinks = expand_drinks(o, lines);
  const paid = Boolean(o.is_paid);
  const phone = format_phone(o.customer_phone);
  const in_ready_column = o.status === 'ready';

  useEffect(() => {
    const id = setInterval(() => set_now(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // авто-готово по таймеру
  useEffect(() => {
    for (const d of drinks) {
      const st = prep[d.key];
      if (!st || st.done || !st.started_at) continue;
      const ends = st.started_at + d.prep_minutes * 60_000;
      if (now >= ends) on_mark_drink_done(o.id, d.key);
    }
  }, [now, drinks, prep, o.id, on_mark_drink_done]);

  const all_done =
    drinks.length > 0 && drinks.every((d) => prep[d.key]?.done);
  const show_hand_out = in_ready_column || all_done;

  return (
    <article
      className={`rounded-2xl border bg-white px-4 py-3.5 transition ${
        is_new
          ? 'border-accent ring-2 ring-accent/25 animate-[pulse_1.2s_ease-in-out_2]'
          : 'border-neutral-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-neutral-400">
            № {format_order_number(o)}
            {is_new ? <span className="ml-2 text-accent">новый</span> : null}
          </p>
          <p className="text-[15px] font-semibold text-neutral-900 truncate mt-0.5">
            {customer_label(o)}
          </p>
          {phone ? (
            <p className="text-xs text-neutral-500 tabular-nums mt-0.5">{phone}</p>
          ) : (
            <p className="text-xs text-amber-600 mt-0.5">телефон не указан</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold tabular-nums text-accent leading-none">
            {pickup_label(o.pickup_time)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-1">выдача</p>
          <p
            className={`text-[11px] mt-1 font-medium ${
              paid ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {paid ? 'оплачен' : 'не оплачен'}
          </p>
        </div>
      </div>

      {!in_ready_column && (
        <ul className="mt-3 space-y-1.5">
          {drinks.map((d) => {
            const st = prep[d.key] || { started_at: null, done: false };
            const ends_at = st.started_at
              ? st.started_at + d.prep_minutes * 60_000
              : null;
            const left = ends_at ? Math.max(0, ends_at - now) : 0;
            const cooking = Boolean(st.started_at && !st.done);

            return (
              <li
                key={d.key}
                className="flex items-center justify-between gap-2 text-sm py-1"
              >
                <div className="min-w-0">
                  <p className="truncate text-neutral-800">{d.name}</p>
                  <p className="text-[10px] text-neutral-400">{d.prep_minutes} мин</p>
                </div>
                <div className="shrink-0">
                  {st.done ? (
                    <span className="text-xs font-semibold text-emerald-600">готово</span>
                  ) : cooking ? (
                    <span className="font-mono text-base font-bold tabular-nums text-accent">
                      {format_countdown_ms(left)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => on_start_drink(o.id, d.key, d.prep_minutes)}
                      className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      начать
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-base font-bold font-mono tabular-nums text-neutral-900">
          {o.total_price} ₽
        </p>
        <div className="flex gap-2">
          {!paid && (
            <button
              type="button"
              onClick={() => on_pay(o)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700"
            >
              касса
            </button>
          )}
          {show_hand_out && (
            <button
              type="button"
              onClick={() => on_hand_out(o)}
              className="rounded-xl bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground"
            >
              выдан
            </button>
          )}
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
        <p className="text-sm text-neutral-500 mt-1 mb-4">точка работы</p>
        <ul className="space-y-2">
          {spots.map((spot) => (
            <li key={spot.id}>
              <button
                type="button"
                onClick={() => on_pick(spot)}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:border-accent/40"
              >
                <p className="font-semibold text-neutral-900">{spot.address}</p>
                <p className="text-xs text-neutral-500 capitalize mt-0.5">{spot.city}</p>
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
  const [prep_map, set_prep_map] = useState<Record<string, Record<string, prep_state>>>({});
  const [fresh_ids, set_fresh_ids] = useState<Set<string>>(new Set());
  const known_ids = useRef<Set<string> | null>(null);

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
        .select('*, profiles:user_id(name, phone)')
        .in('status', ['new', 'preparing', 'ready'])
        .order('created_at', { ascending: false });
      for (const row of (data as Array<order & { profiles?: { name?: string; phone?: string } | null }>) || []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const profile = row.profiles;
        merged.push({
          ...row,
          customer_name: row.customer_name || profile?.name || 'гость',
          customer_phone: row.customer_phone || profile?.phone || null,
          is_paid: Boolean(row.is_paid),
        });
      }
    }

    merged.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    set_orders(merged);
  }, []);

  useEffect(() => {
    set_prep_map(load_prep_map());
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

  // звук + подсветка новых
  useEffect(() => {
    const ids = new Set(orders.map((o) => o.id));
    if (!known_ids.current) {
      known_ids.current = ids;
      return;
    }
    const newcomers: string[] = [];
    for (const id of ids) {
      if (!known_ids.current.has(id)) newcomers.push(id);
    }
    known_ids.current = ids;
    if (!newcomers.length) return;

    play_new_order_chime();
    set_fresh_ids((prev) => {
      const next = new Set(prev);
      for (const id of newcomers) next.add(id);
      return next;
    });
    const t = window.setTimeout(() => {
      set_fresh_ids((prev) => {
        const next = new Set(prev);
        for (const id of newcomers) next.delete(id);
        return next;
      });
    }, 12000);
    return () => window.clearTimeout(t);
  }, [orders]);

  const update_prep = useCallback(
    (order_id: string, drink_key: string, patch: Partial<prep_state>) => {
      set_prep_map((prev) => {
        const current = prev[order_id]?.[drink_key];
        if (
          patch.done === true &&
          current?.done === true &&
          patch.started_at === undefined
        ) {
          return prev;
        }
        const order_prep = { ...(prev[order_id] || {}) };
        order_prep[drink_key] = {
          started_at: order_prep[drink_key]?.started_at ?? null,
          done: order_prep[drink_key]?.done ?? false,
          ...patch,
        };
        const next = { ...prev, [order_id]: order_prep };
        save_prep_map(next);
        return next;
      });
    },
    []
  );

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
      if (error && /is_paid|customer_/i.test(error.message)) {
        const { is_paid: _p, customer_name: _n, customer_phone: _ph, ...rest } = patch;
        if (Object.keys(rest).length) {
          await supabase.from('orders').update(rest).eq('id', id);
        }
      }
    }
  }

  const start_drink = useCallback(
    (order_id: string, drink_key: string, _prep_minutes: number) => {
      update_prep(order_id, drink_key, { started_at: Date.now(), done: false });
      void patch_order(order_id, { status: 'preparing' }).then(() => load());
    },
    [update_prep, load]
  );

  const mark_drink_done = useCallback(
    (order_id: string, drink_key: string) => {
      update_prep(order_id, drink_key, { done: true });
    },
    [update_prep]
  );

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
    if (o.status === 'ready') {
      await patch_order(o.id, { status: 'completed' });
    } else {
      await patch_order(o.id, { status: 'ready' });
    }
    await load();
  }

  const lines_by_order = new Map<string, schedule_line[]>();
  for (const line of schedule_lines) {
    const list = lines_by_order.get(line.order_id) ?? [];
    list.push(line);
    lines_by_order.set(line.order_id, list);
  }

  const in_work = orders
    .filter((o) => o.status === 'new' || o.status === 'preparing')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const ready = orders
    .filter((o) => o.status === 'ready')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
                {SQUAD_NAME}
              </p>
              <h1 className="text-xl font-bold text-neutral-900">бариста {seller_name}</h1>
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
                      is_new: fresh_ids.has(o.id),
                      prep: prep_map[o.id] || {},
                      on_pay: set_paying,
                      on_start_drink: start_drink,
                      on_mark_drink_done: mark_drink_done,
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
                      is_new: false,
                      prep: prep_map[o.id] || {},
                      on_pay: set_paying,
                      on_start_drink: start_drink,
                      on_mark_drink_done: mark_drink_done,
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
