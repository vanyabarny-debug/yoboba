'use client';

import { useCallback, useEffect, useRef, useState, createElement, type ReactNode } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import { moscow_today_iso } from '@/lib/order-number';
import {
  play_drink_ready_chime,
  play_handout_chime,
  play_payment_chime,
  play_start_chime,
  play_timer_alarm,
} from '@/lib/order-chime';
import { get_active_spots, get_spots } from '@/lib/spot-store';
import { use_page_swipe } from '@/lib/use-page-swipe';
import type { cash_transaction, order, store_spot } from '@/lib/types';
import cash_register_modal from '@/components/seller/cash-register-modal';
import barista_analytics_panel from '@/components/seller/barista-analytics';
import pos_panel from '@/components/seller/pos-panel';
import shift_task_card from '@/components/seller/shift-task-card';
import order_prep_card, {
  type drink_row,
  type prep_state,
} from '@/components/seller/order-prep-card';
import {
  advance_day_task,
  get_board_tasks,
  load_day_tasks,
  mark_appeared,
  type day_task,
} from '@/lib/seller-day-tasks';
import { board_tile_grid } from '@/lib/seller-tile-grid';

const tab_order = ['work', 'ready', 'pos', 'analytics'] as const;
type tab = (typeof tab_order)[number];

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
  id: string;
  spot_id: string;
  address: string;
  city: string;
  opened_at: string;
  shift_date: string;
};

const shift_key = 'yoboba_seller_shift';
const prep_key = 'yoboba_seller_prep';
const order_start_key = 'yoboba_seller_order_start';
const handed_key = 'yoboba_seller_handed';
const paid_key = 'yoboba_seller_paid';
const NEW_ORDER_BLINK_MS = 2200;

function shift_day(shift_date?: string | null) {
  return shift_date || moscow_today_iso();
}

function load_paid_ids(day: string): Set<string> {
  try {
    const raw = localStorage.getItem(paid_key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day?: string; ids?: string[] };
    if (parsed.day !== day) return new Set();
    return new Set(parsed.ids || []);
  } catch {
    return new Set();
  }
}

function save_paid_ids(day: string, ids: Set<string>) {
  localStorage.setItem(
    paid_key,
    JSON.stringify({ day, ids: [...ids].slice(-80) })
  );
}

function mark_order_paid_local(id: string, day: string) {
  const ids = load_paid_ids(day);
  ids.add(id);
  save_paid_ids(day, ids);
  return ids;
}

function with_sticky_paid(list: order[], day: string): order[] {
  const paid = load_paid_ids(day);
  if (!paid.size) return list;
  return list.map((o) => (paid.has(o.id) || o.is_paid ? { ...o, is_paid: true } : o));
}

function load_handed(day: string): order[] {
  try {
    const raw = localStorage.getItem(handed_key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day?: string; orders?: order[] };
    if (parsed.day !== day) return [];
    return parsed.orders || [];
  } catch {
    return [];
  }
}

function save_handed(day: string, list: order[]) {
  localStorage.setItem(
    handed_key,
    JSON.stringify({ day, orders: list.slice(0, 50) })
  );
}

function load_shift(): seller_shift | null {
  try {
    const raw = sessionStorage.getItem(shift_key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<seller_shift>;
    if (!parsed?.id || !parsed.spot_id) return null;
    return {
      id: parsed.id,
      spot_id: parsed.spot_id,
      address: parsed.address || '',
      city: parsed.city || '',
      opened_at: parsed.opened_at || new Date().toISOString(),
      shift_date: parsed.shift_date || moscow_today_iso(),
    };
  } catch {
    return null;
  }
}

function save_shift(shift: seller_shift) {
  sessionStorage.setItem(shift_key, JSON.stringify(shift));
}

function load_prep_map(): Record<string, Record<string, prep_state>> {
  try {
    const raw = localStorage.getItem(prep_key) || sessionStorage.getItem(prep_key) || '{}';
    return JSON.parse(raw) as Record<string, Record<string, prep_state>>;
  } catch {
    return {};
  }
}

function save_prep_map(map: Record<string, Record<string, prep_state>>) {
  const raw = JSON.stringify(map);
  localStorage.setItem(prep_key, raw);
  sessionStorage.setItem(prep_key, raw);
}

function load_order_starts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(order_start_key) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function save_order_starts(map: Record<string, number>) {
  localStorage.setItem(order_start_key, JSON.stringify(map));
}

function expand_drinks(o: order, lines: schedule_line[]): drink_row[] {
  const prep_by_menu = new Map<string, number>();
  for (const l of lines) {
    if (!prep_by_menu.has(l.menu_id)) {
      prep_by_menu.set(l.menu_id, l.prep_minutes || DEFAULT_PREP_MINUTES);
    }
  }
  const rows: drink_row[] = [];
  for (const item of o.items as order['items']) {
    for (let q = 0; q < item.quantity; q++) {
      rows.push({
        key: `${o.id}:${item.menu_id}:${q}`,
        name: item.name,
        menu_id: item.menu_id,
        prep_minutes: prep_by_menu.get(item.menu_id) || DEFAULT_PREP_MINUTES,
      });
    }
  }
  return rows;
}

function all_drinks_done_map(
  drinks: drink_row[],
  existing?: Record<string, prep_state>
): Record<string, prep_state> {
  const next: Record<string, prep_state> = {};
  for (const d of drinks) {
    next[d.key] = {
      started_at: existing?.[d.key]?.started_at ?? null,
      done: true,
      finished_at: existing?.[d.key]?.finished_at ?? Date.now(),
    };
  }
  return next;
}

function sync_prep_to_server(order_id: string, prep: Record<string, prep_state>) {
  void fetch('/api/seller/prep-state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ order_id, prep }),
  });
}

function clear_prep_on_server(order_id: string) {
  void fetch('/api/seller/prep-state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ order_id, clear: true }),
  });
}

function shift_picker({
  spots,
  busy,
  on_pick,
}: {
  spots: store_spot[];
  busy?: boolean;
  on_pick: (spot: store_spot) => void | Promise<void>;
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
                disabled={busy}
                onClick={() => void on_pick(spot)}
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:border-neutral-400 disabled:opacity-50"
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
  const [tab, set_tab] = useState<tab>('work');
  const [orders, set_orders] = useState<order[]>([]);
  const [schedule_lines, set_schedule_lines] = useState<schedule_line[]>([]);
  const [paying, set_paying] = useState<order | null>(null);
  const [seller_id, set_seller_id] = useState('');
  const [seller_name, set_seller_name] = useState('бариста');
  const [shift, set_shift] = useState<seller_shift | null>(null);
  const [shift_spots, set_shift_spots] = useState<store_spot[]>([]);
  const [need_shift, set_need_shift] = useState(false);
  const [shift_busy, set_shift_busy] = useState(false);
  const [prep_map, set_prep_map] = useState<Record<string, Record<string, prep_state>>>({});
  const [order_starts, set_order_starts] = useState<Record<string, number>>({});
  const [handed, set_handed] = useState<order[]>([]);
  const [day_tasks, set_day_tasks] = useState<day_task[]>([]);
  const [fresh_ids, set_fresh_ids] = useState<Set<string>>(new Set());
  const [unread_new, set_unread_new] = useState(0);
  const [pos_depth, set_pos_depth] = useState(false);
  const known_ids = useRef<Set<string> | null>(null);
  const pending_blink_ref = useRef<Set<string>>(new Set());
  const seller_ref = useRef({ id: '', name: 'бариста' });
  const schedule_ref = useRef<schedule_line[]>([]);
  const alarm_timer = useRef<number | null>(null);
  const tab_ref = useRef(tab);
  const tab_index = tab_order.indexOf(tab);

  const { viewport_ref, page_style } = use_page_swipe({
    index: Math.max(0, tab_index),
    count: tab_order.length,
    enabled: !paying && !need_shift && !(tab === 'pos' && pos_depth),
    on_index: (next) => set_tab(tab_order[next] ?? 'work'),
  });

  useEffect(() => {
    tab_ref.current = tab;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'pos') set_pos_depth(false);
  }, [tab]);

  function stop_order_alarm() {
    if (alarm_timer.current != null) {
      window.clearInterval(alarm_timer.current);
      alarm_timer.current = null;
    }
  }

  function start_order_alarm() {
    if (alarm_timer.current != null) return;
    play_timer_alarm();
    alarm_timer.current = window.setInterval(() => play_timer_alarm(), 2000);
  }

  function notify_new_orders(count: number) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const title = count === 1 ? 'новый заказ' : `новых заказов: ${count}`;
    const body = 'откройте «в работе», чтобы заглушить сигнал';
    try {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, tag: 'yoboba-seller-new-order' });
      } else if (Notification.permission === 'default') {
        void Notification.requestPermission().then((p) => {
          if (p === 'granted') {
            new Notification(title, { body, tag: 'yoboba-seller-new-order' });
          }
        });
      }
    } catch {
      /* ignore */
    }
  }

  const hydrate_prep = useCallback(
    async (list: order[], lines: schedule_line[]) => {
      let remote: Record<string, Record<string, prep_state>> = {};
      try {
        const res = await fetch('/api/seller/prep-state', { credentials: 'same-origin' });
        if (res.ok) {
          const body = (await res.json()) as {
            prep?: Record<string, Record<string, prep_state>>;
          };
          remote = body.prep || {};
        }
      } catch {
        /* local only */
      }

      const local = load_prep_map();
      const merged: Record<string, Record<string, prep_state>> = { ...local, ...remote };

      for (const o of list) {
        const drinks = expand_drinks(
          o,
          lines.filter((l) => l.order_id === o.id)
        );
        if (o.status === 'ready') {
          merged[o.id] = all_drinks_done_map(drinks, merged[o.id]);
        }
      }

      save_prep_map(merged);
      set_prep_map(merged);
    },
    []
  );

  const load = useCallback(async () => {
    let list: order[] = [];
    let lines: schedule_line[] = [];

    try {
      const sched_res = await fetch('/api/kitchen/schedule', { credentials: 'same-origin' });
      if (sched_res.ok) {
        const body = (await sched_res.json()) as {
          lines?: schedule_line[];
          orders?: order[];
        };
        lines = body.lines ?? [];
        if (body.orders) list = body.orders;
      }
    } catch {
      /* fallback */
    }

    if (!list.length) {
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
        for (const row of (data as Array<
          order & { profiles?: { name?: string; phone?: string } | null }
        >) || []) {
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
      list = merged;
    }

    schedule_ref.current = lines;
    set_schedule_lines(lines);
    const day = shift_day(shift?.shift_date);
    set_orders(with_sticky_paid(list, day));
    await hydrate_prep(list, lines);

    // выданные за смену — тот же seller_id+day, что в аналитике
    const sid = seller_ref.current.id || seller_id || '';
    const completed: order[] = [];
    const seen_done = new Set<string>();
    let from_server = false;

    if (sid) {
      try {
        const qs = new URLSearchParams({ completed: '1', day, seller_id: sid });
        const res = await fetch(`/api/seller/orders?${qs}`, {
          credentials: 'same-origin',
        });
        if (res.ok) {
          from_server = true;
          const body = (await res.json()) as { orders?: order[] };
          for (const o of body.orders || []) {
            if (seen_done.has(o.id)) continue;
            seen_done.add(o.id);
            completed.push(o);
          }
        }
      } catch {
        /* offline */
      }
    }

    if (!from_server) {
      for (const o of load_handed(day)) {
        if (seen_done.has(o.id)) continue;
        seen_done.add(o.id);
        completed.push(o);
      }
    }

    completed.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    set_handed(completed);
    save_handed(day, completed);
  }, [hydrate_prep, shift?.shift_date, seller_id]);

  useEffect(() => {
    set_prep_map(load_prep_map());
    set_order_starts(load_order_starts());
    set_handed(load_handed(shift_day()));
    const user = get_demo_user();
    if (user) {
      set_seller_id(user.id);
      set_seller_name(user.name);
      seller_ref.current = { id: user.id, name: user.name };
    }

    const existing = load_shift();
    if (existing) {
      set_shift(existing);
      set_need_shift(false);
    } else {
      let allowed_ids: string[] = [];
      try {
        allowed_ids = JSON.parse(
          sessionStorage.getItem('yoboba_seller_spot_ids') || '[]'
        ) as string[];
      } catch {
        allowed_ids = [];
      }
      const all = get_active_spots();
      const available =
        allowed_ids.length > 0
          ? all.filter((s) => allowed_ids.includes(s.id))
          : all.length
            ? all
            : get_spots();
      set_shift_spots(available.length ? available : get_spots());
      set_need_shift(true);
    }

    load();
    const poll = window.setInterval(load, 4000);

    if (is_supabase_configured()) {
      const supabase = create_client();
      const channel = supabase
        .channel('seller-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
          load()
        )
        .subscribe();
      return () => {
        window.clearInterval(poll);
        supabase.removeChannel(channel);
      };
    }
    return () => window.clearInterval(poll);
  }, [load]);

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

    notify_new_orders(newcomers.length);

    if (tab_ref.current === 'work') {
      // уже на доске — короткое мигание, без будильника
      set_unread_new(0);
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
      }, NEW_ORDER_BLINK_MS);
      return () => window.clearTimeout(t);
    }

    // на другой вкладке — копим бейдж и «ожидание просмотра»
    set_unread_new((n) => n + newcomers.length);
    start_order_alarm();
    for (const id of newcomers) pending_blink_ref.current.add(id);
  }, [orders]);

  // впервые открыли «в работе» с новыми — коротко мигнуть и погасить бейдж
  useEffect(() => {
    if (tab !== 'work') return;
    stop_order_alarm();
    set_unread_new(0);

    const ids = [...pending_blink_ref.current];
    if (!ids.length) return;
    pending_blink_ref.current.clear();

    set_fresh_ids((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    const t = window.setTimeout(() => {
      set_fresh_ids((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }, NEW_ORDER_BLINK_MS);
    return () => window.clearTimeout(t);
  }, [tab]);

  useEffect(() => {
    return () => stop_order_alarm();
  }, []);

  useEffect(() => {
    if (!shift?.spot_id) {
      set_day_tasks([]);
      return;
    }
    const spot = shift.spot_id;
    function sync() {
      const loaded = load_day_tasks(spot);
      set_day_tasks(mark_appeared(spot, loaded));
    }
    sync();
    const id = window.setInterval(sync, 30_000);
    return () => window.clearInterval(id);
  }, [shift?.spot_id]);

  function advance_task(task_id: string, choice?: 'continue' | 'complete') {
    if (!shift?.spot_id) return;
    const next = advance_day_task(shift.spot_id, task_id, moscow_today_iso(), choice);
    const advanced = next.find((t) => t.id === task_id);
    if (advanced?.phase === 'running') play_start_chime();
    set_day_tasks(next);
  }

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
          finished_at: order_prep[drink_key]?.finished_at ?? null,
          ...patch,
        };
        const next = { ...prev, [order_id]: order_prep };
        save_prep_map(next);
        sync_prep_to_server(order_id, order_prep);
        return next;
      });
    },
    []
  );

  async function patch_order(id: string, patch: Partial<order>) {
    const res = await fetch('/api/seller/orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, patch }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      order?: order | null;
      warning?: string;
    } | null;
    if (!res.ok) {
      throw new Error(body?.error || 'не удалось обновить заказ');
    }

    if (patch.is_paid) {
      mark_order_paid_local(id, shift_day(shift?.shift_date));
    }

    const server = body?.order;
    set_orders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const merged = {
          ...o,
          ...(server || {}),
          ...patch,
        };
        if (patch.is_paid || load_paid_ids(shift_day(shift?.shift_date)).has(id) || o.is_paid || server?.is_paid) {
          merged.is_paid = true;
        }
        return merged;
      })
    );
  }

  const start_drink = useCallback(
    (order_id: string, drink: drink_row) => {
      update_prep(order_id, drink.key, { started_at: Date.now(), done: false });
      set_order_starts((prev) => {
        if (prev[order_id]) return prev;
        const next = { ...prev, [order_id]: Date.now() };
        save_order_starts(next);
        return next;
      });
      // взяли в работу — больше не мигаем
      set_fresh_ids((prev) => {
        if (!prev.has(order_id)) return prev;
        const next = new Set(prev);
        next.delete(order_id);
        return next;
      });
      pending_blink_ref.current.delete(order_id);
      void patch_order(order_id, { status: 'preparing' }).catch(() => {});
    },
    [update_prep]
  );

  const mark_drink_done = useCallback(
    (
      order_id: string,
      drink: drink_row,
      meta: { actual_ms: number; expected_ms: number; started_at: number }
    ) => {
      const prev = load_prep_map();
      if (prev[order_id]?.[drink.key]?.done) return;

      const order_prep = { ...(prev[order_id] || {}) };
      order_prep[drink.key] = {
        started_at: meta.started_at,
        done: true,
        finished_at: Date.now(),
      };
      const next = { ...prev, [order_id]: order_prep };
      save_prep_map(next);
      set_prep_map(next);
      sync_prep_to_server(order_id, order_prep);

      const o = orders.find((row) => row.id === order_id);
      void fetch('/api/seller/prep-stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          kind: 'prep',
          event: {
            seller_id: seller_ref.current.id || seller_id || 'seller',
            seller_name: seller_ref.current.name || seller_name,
            order_id,
            drink_key: drink.key,
            drink_name: drink.name,
            menu_id: drink.menu_id,
            expected_ms: meta.expected_ms,
            actual_ms: meta.actual_ms,
            started_at: new Date(meta.started_at).toISOString(),
            finished_at: new Date().toISOString(),
            pickup_at: o?.pickup_time || new Date().toISOString(),
            shift_date: shift?.shift_date || moscow_today_iso(),
          },
        }),
      });

      if (o) {
        const lines = schedule_ref.current.filter((l) => l.order_id === order_id);
        const drinks = expand_drinks(o, lines);
        const all = drinks.length > 0 && drinks.every((d) => next[order_id]?.[d.key]?.done);
        if (all) {
          // готово к оплате/выдаче — остаёмся во «в работе», дублируем во «готовые»
          void patch_order(order_id, { status: 'ready' }).catch(() => {});
        }
      }
    },
    [orders, seller_id, seller_name, shift?.shift_date]
  );

  async function complete_payment(payment_method: 'cash' | 'card', amount_received?: number) {
    if (!paying) return;
    const total = Number(paying.total_price);
    const change =
      payment_method === 'cash' && amount_received != null
        ? Math.max(0, amount_received - total)
        : null;

    const sid = seller_id || seller_ref.current.id || 'seller';
    const sname = seller_name || seller_ref.current.name || 'бариста';

    const tx: cash_transaction = {
      id: `cash-${Date.now()}`,
      order_id: paying.id,
      seller_id: sid,
      seller_name: sname,
      order_total: total,
      payment_method,
      amount_received: payment_method === 'cash' ? amount_received ?? null : null,
      change_given: change,
      items_summary: (paying.items as order['items'])
        .map((i) => `${i.name} ×${i.quantity}`)
        .join('; '),
      shift_date: shift?.shift_date || moscow_today_iso(),
      created_at: new Date().toISOString(),
      spot_id: shift?.spot_id || null,
      spot_address: shift?.address || null,
      shift_id: shift?.id || null,
    };

    const cash_res = await fetch('/api/cash', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(tx),
    });
    if (!cash_res.ok) {
      const body = (await cash_res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error || 'не удалось провести оплату в кассе');
      return;
    }

    try {
      await patch_order(paying.id, {
        is_paid: true,
        payment_type: payment_method,
        status: 'ready',
      });
      mark_order_paid_local(paying.id, shift_day(shift?.shift_date));
    } catch (e) {
      // касса уже провела оплату — держим «выдать» локально даже если PATCH частично упал
      mark_order_paid_local(paying.id, shift_day(shift?.shift_date));
      set_orders((prev) =>
        prev.map((o) =>
          o.id === paying.id ? { ...o, is_paid: true, payment_type: payment_method, status: 'ready' } : o
        )
      );
      console.warn(e);
    }

    const drinks = expand_drinks(
      paying,
      schedule_ref.current.filter((l) => l.order_id === paying.id)
    );
    const done_map = all_drinks_done_map(drinks, prep_map[paying.id]);
    const next = { ...load_prep_map(), [paying.id]: done_map };
    save_prep_map(next);
    set_prep_map(next);
    sync_prep_to_server(paying.id, done_map);

    set_paying(null);
    play_payment_chime();
  }

  async function hand_out(o: order) {
    const started =
      order_starts[o.id] ||
      Object.values(prep_map[o.id] || {})
        .map((p) => p.started_at)
        .filter((n): n is number => typeof n === 'number')
        .sort((a, b) => a - b)[0] ||
      new Date(o.created_at).getTime();

    const sid = seller_id || seller_ref.current.id || 'seller';
    const sname = seller_name || seller_ref.current.name || 'бариста';
    const day = shift_day(shift?.shift_date);
    const done: order = { ...o, status: 'completed', is_paid: o.is_paid ?? true };

    const fulfill_res = await fetch('/api/seller/prep-stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        kind: 'fulfillment',
        order: done,
        event: {
          seller_id: sid,
          seller_name: sname,
          order_id: o.id,
          started_at: new Date(started).toISOString(),
          finished_at: new Date().toISOString(),
          pickup_at: o.pickup_time,
          shift_date: day,
        },
      }),
    });
    if (!fulfill_res.ok) {
      const body = (await fulfill_res.json().catch(() => null)) as { error?: string } | null;
      alert(body?.error || 'не удалось записать выдачу');
      return;
    }

    try {
      await patch_order(o.id, { status: 'completed' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'не удалось выдать заказ');
      return;
    }

    clear_prep_on_server(o.id);
    const map = load_prep_map();
    delete map[o.id];
    save_prep_map(map);
    set_prep_map(map);

    play_handout_chime();

    set_handed((prev) => {
      const next = [done, ...prev.filter((x) => x.id !== o.id)].slice(0, 50);
      save_handed(day, next);
      return next;
    });
    set_orders((prev) => prev.filter((row) => row.id !== o.id));
  }

  function on_final_action(o: order) {
    if (!o.is_paid) {
      set_paying(o);
      return;
    }
    void hand_out(o);
  }

  const lines_by_order = new Map<string, schedule_line[]>();
  for (const line of schedule_lines) {
    const list = lines_by_order.get(line.order_id) ?? [];
    list.push(line);
    lines_by_order.set(line.order_id, list);
  }

  function drinks_for(o: order) {
    return expand_drinks(o, lines_by_order.get(o.id) ?? []);
  }

  function is_all_done(o: order) {
    if (o.status === 'ready') return true;
    const drinks = drinks_for(o);
    if (!drinks.length) return false;
    return drinks.every((d) => prep_map[o.id]?.[d.key]?.done);
  }

  const in_work = orders
    .filter((o) => o.status === 'new' || o.status === 'preparing' || o.status === 'ready')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  /** вкладка «готовые» — только уже выданные за смену */
  const handed_out = handed;

  function card_mode_for_work(o: order): 'work' | 'ready' {
    if (o.status === 'ready' || is_all_done(o)) return 'ready';
    return 'work';
  }

  const tabs: { id: tab; label: string }[] = [
    { id: 'work', label: 'в работе' },
    { id: 'ready', label: 'готовые' },
    { id: 'pos', label: 'касса' },
    { id: 'analytics', label: 'аналитика' },
  ];

  const { open: open_tasks, done: done_tasks } = get_board_tasks(day_tasks);
  const work_board_count = in_work.length + open_tasks.length;
  const ready_board_count = handed_out.length + done_tasks.length;
  /** бейдж «готовые» = число выдач, как в аналитике (задачи смены не считаем) */
  const ready_handout_count = handed_out.length;

  function render_fill_grid(count: number, children: ReactNode) {
    if (count === 0) return null;
    const { cols, rows } = board_tile_grid(count);
    return (
      <div
        className="grid flex-1 min-h-0 gap-2 overflow-hidden h-full content-start transition-[grid-template-columns,grid-template-rows] duration-500 ease-out"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {children}
      </div>
    );
  }

  function render_work_list() {
    const items = work_board_count;
    if (items === 0) {
      return (
        <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/70 text-sm text-neutral-400">
          пусто
        </div>
      );
    }
    return render_fill_grid(
      items,
      <>
        {open_tasks.map((t) =>
          createElement(shift_task_card, {
            key: `task-${t.id}`,
            task: t,
            mode: 'work',
            on_advance: advance_task,
          })
        )}
        {in_work.map((o) =>
          createElement(order_prep_card, {
            key: `work-${o.id}`,
            order: o,
            drinks: drinks_for(o),
            prep: prep_map[o.id] || {},
            is_new: fresh_ids.has(o.id),
            mode: card_mode_for_work(o),
            on_start_drink: start_drink,
            on_mark_drink_done: mark_drink_done,
            on_final_action,
          })
        )}
      </>
    );
  }

  function render_handed_list() {
    const items = ready_board_count;
    if (items === 0) {
      return (
        <div className="flex-1 flex items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white/70 text-sm text-neutral-400">
          за смену ещё ничего не выдавали
        </div>
      );
    }
    return render_fill_grid(
      items,
      <>
        {done_tasks.map((t) =>
          createElement(shift_task_card, {
            key: `task-done-${t.id}`,
            task: t,
            mode: 'done',
            on_advance: advance_task,
          })
        )}
        {handed_out.map((o) =>
          createElement(order_prep_card, {
            key: `handed-${o.id}`,
            order: o,
            drinks: drinks_for(o),
            prep:
              prep_map[o.id] ||
              Object.fromEntries(
                drinks_for(o).map((d) => [d.key, { started_at: null, done: true }])
              ),
            mode: 'done',
            on_start_drink: start_drink,
            on_mark_drink_done: mark_drink_done,
            on_final_action: () => {},
          })
        )}
      </>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--safe-top)-var(--safe-bottom))] min-h-0 flex-col bg-[#f0f1f4]">
      {need_shift &&
        createElement(shift_picker, {
          spots: shift_spots,
          busy: shift_busy,
          on_pick: async (spot) => {
            set_shift_busy(true);
            try {
              const sid = seller_id || seller_ref.current.id || 'seller';
              const sname = seller_name || seller_ref.current.name || 'бариста';
              const res = await fetch('/api/seller/shifts', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  spot_id: spot.id,
                  spot_address: spot.address,
                  spot_city: spot.city,
                  seller_id: sid,
                  seller_name: sname,
                }),
              });
              const body = (await res.json().catch(() => null)) as {
                shift?: {
                  id: string;
                  spot_id: string;
                  spot_address: string;
                  spot_city: string;
                  opened_at: string;
                  shift_date: string;
                };
                error?: string;
              } | null;
              if (!res.ok || !body?.shift) {
                alert(body?.error || 'не удалось открыть смену');
                return;
              }
              const next: seller_shift = {
                id: body.shift.id,
                spot_id: body.shift.spot_id,
                address: body.shift.spot_address || spot.address,
                city: body.shift.spot_city || spot.city,
                opened_at: body.shift.opened_at,
                shift_date: body.shift.shift_date,
              };
              save_shift(next);
              set_shift(next);
              set_need_shift(false);
              set_day_tasks(mark_appeared(next.spot_id, load_day_tasks(next.spot_id)));
            } finally {
              set_shift_busy(false);
            }
          },
        })}

      <header className="sticky top-[var(--safe-top)] z-20 shrink-0 border-b border-neutral-200/80 bg-white/95 backdrop-blur-xl">
        <div className="w-full px-2.5 pt-1.5 pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-baseline gap-1.5">
              <span className="text-sm text-neutral-500 shrink-0">бариста</span>
              <h1 className="text-sm font-bold text-accent truncate">{seller_name}</h1>
              <span className="text-[10px] text-neutral-400 truncate">
                {shift ? shift.address : 'смена закрыта'}
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (shift?.id) {
                  await fetch('/api/seller/shifts', {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ id: shift.id, action: 'close' }),
                  }).catch(() => {});
                }
                sessionStorage.removeItem(shift_key);
                await clear_session();
                router.push('/admin/login');
              }}
              className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-neutral-500"
            >
              выйти
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-4 gap-0.5 rounded-xl bg-surface p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set_tab(t.id)}
                className={`relative rounded-lg py-1.5 text-[11px] font-medium transition ${
                  tab === t.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                {t.label}
                {t.id === 'work' && work_board_count > 0 ? (
                  <span className="ml-0.5 inline-flex min-w-[1rem] justify-center rounded-full bg-neutral-200 px-1 text-[9px] font-bold tabular-nums text-neutral-600">
                    {work_board_count}
                  </span>
                ) : null}
                {t.id === 'work' && unread_new > 0 ? (
                  <span className="absolute -right-0.5 -top-1 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-accent px-1 py-0.5 text-[9px] font-bold leading-none tabular-nums text-white shadow-sm">
                    {unread_new}
                  </span>
                ) : null}
                {t.id === 'ready' && ready_handout_count ? (
                  <span className="ml-0.5 text-[9px] text-neutral-400">{ready_handout_count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main ref={viewport_ref} className="relative flex-1 min-h-0 w-full overflow-hidden touch-pan-y">
        <div
          className="absolute inset-0 px-2 py-2 flex flex-col overflow-hidden"
          style={page_style(0)}
        >
          {render_work_list()}
        </div>
        <div
          className="absolute inset-0 px-2 py-2 flex flex-col overflow-hidden"
          style={page_style(1)}
        >
          {render_handed_list()}
        </div>
        <div
          className="absolute inset-0 px-2 py-2 flex flex-col overflow-hidden"
          style={page_style(2)}
        >
          {createElement(pos_panel, {
            on_created: () => {
              set_tab('work');
              void load();
            },
            on_nav_depth: set_pos_depth,
            seller_id,
            seller_name,
            shift_id: shift?.id || null,
            shift_date: shift?.shift_date,
            spot_id: shift?.spot_id || null,
            spot_address: shift?.address || null,
          })}
        </div>
        <div
          className="absolute inset-0 max-w-3xl mx-auto px-4 py-4 overflow-y-auto"
          style={page_style(3)}
        >
          {createElement(barista_analytics_panel, {
            seller_id,
            seller_name,
            spot_id: shift?.spot_id,
            shift_id: shift?.id,
            shift_date: shift?.shift_date,
          })}
        </div>
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
