'use client';

import { useCallback, useEffect, useRef, useState, createElement } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import { moscow_today_iso } from '@/lib/order-number';
import { play_handout_chime, play_payment_chime, play_timer_alarm } from '@/lib/order-chime';
import { get_active_spots, get_spots } from '@/lib/spot-store';
import type { cash_transaction, order, store_spot } from '@/lib/types';
import cash_register_modal from '@/components/seller/cash-register-modal';
import barista_analytics_panel from '@/components/seller/barista-analytics';
import pos_panel from '@/components/seller/pos-panel';
import order_prep_card, {
  type drink_row,
  type prep_state,
} from '@/components/seller/order-prep-card';

type tab = 'work' | 'ready' | 'pos' | 'analytics';

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
const prep_key = 'yoboba_seller_prep';
const order_start_key = 'yoboba_seller_order_start';
const handed_key = 'yoboba_seller_handed';

function shift_day() {
  return moscow_today_iso();
}

function load_handed(): order[] {
  try {
    const raw = localStorage.getItem(handed_key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day?: string; orders?: order[] };
    if (parsed.day !== shift_day()) return [];
    return parsed.orders || [];
  } catch {
    return [];
  }
}

function save_handed(list: order[]) {
  localStorage.setItem(
    handed_key,
    JSON.stringify({ day: shift_day(), orders: list.slice(0, 50) })
  );
}

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
                className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:border-neutral-400"
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
  const [prep_map, set_prep_map] = useState<Record<string, Record<string, prep_state>>>({});
  const [order_starts, set_order_starts] = useState<Record<string, number>>({});
  const [handed, set_handed] = useState<order[]>([]);
  const [fresh_ids, set_fresh_ids] = useState<Set<string>>(new Set());
  const [unread_new, set_unread_new] = useState(0);
  const known_ids = useRef<Set<string> | null>(null);
  const seller_ref = useRef({ id: '', name: 'бариста' });
  const schedule_ref = useRef<schedule_line[]>([]);
  const alarm_timer = useRef<number | null>(null);
  const tab_ref = useRef(tab);

  useEffect(() => {
    tab_ref.current = tab;
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
    set_orders(list);
    await hydrate_prep(list, lines);

    // выданные за сегодня — вкладка «готовые»
    const day = shift_day();
    const completed: order[] = [];
    const seen_done = new Set<string>();

    try {
      const res = await fetch(
        `/api/seller/orders?completed=1&day=${encodeURIComponent(day)}`,
        { credentials: 'same-origin' }
      );
      if (res.ok) {
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

    const local_handed = load_handed();
    for (const o of local_handed) {
      if (seen_done.has(o.id)) continue;
      seen_done.add(o.id);
      completed.push(o);
    }

    completed.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    set_handed(completed);
    save_handed(completed);
  }, [hydrate_prep]);

  useEffect(() => {
    set_prep_map(load_prep_map());
    set_order_starts(load_order_starts());
    set_handed(load_handed());
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
    set_fresh_ids((prev) => {
      const next = new Set(prev);
      for (const id of newcomers) next.add(id);
      return next;
    });

    if (tab_ref.current === 'work') {
      // уже смотрят доску — только мигание, без будильника
      set_unread_new(0);
    } else {
      set_unread_new((n) => n + newcomers.length);
      start_order_alarm();
    }

    const t = window.setTimeout(() => {
      set_fresh_ids((prev) => {
        const next = new Set(prev);
        for (const id of newcomers) next.delete(id);
        return next;
      });
    }, 25000);
    return () => window.clearTimeout(t);
  }, [orders]);

  // будильник гасится только когда открыли «в работе»
  useEffect(() => {
    if (tab !== 'work') return;
    stop_order_alarm();
    set_unread_new(0);
  }, [tab]);

  useEffect(() => {
    return () => stop_order_alarm();
  }, []);

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
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || 'не удалось обновить заказ');
    }
    set_orders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
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
    [orders, seller_id, seller_name]
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
      shift_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
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
    } catch (e) {
      alert(e instanceof Error ? e.message : 'оплата записана, статус заказа не обновился');
      return;
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

    await fetch('/api/seller/prep-stats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        kind: 'fulfillment',
        event: {
          seller_id: sid,
          seller_name: sname,
          order_id: o.id,
          started_at: new Date(started).toISOString(),
          finished_at: new Date().toISOString(),
          pickup_at: o.pickup_time,
        },
      }),
    });

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

    const done: order = { ...o, status: 'completed', is_paid: o.is_paid ?? true };
    set_handed((prev) => {
      const next = [done, ...prev.filter((x) => x.id !== o.id)].slice(0, 50);
      save_handed(next);
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

  function render_work_list() {
    if (in_work.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-14 text-center text-sm text-neutral-400">
          пусто
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
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
      </div>
    );
  }

  function render_handed_list() {
    if (handed_out.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 px-4 py-14 text-center text-sm text-neutral-400">
          за смену ещё ничего не выдавали
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
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
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f0f1f4] flex flex-col">
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

      <header className="sticky mobile-sticky-top z-20 shrink-0 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl">
        <div className="w-full px-2.5 pt-1.5 pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-baseline gap-1.5">
              <h1 className="text-sm font-bold text-neutral-900 truncate">
                {seller_name}
              </h1>
              <span className="text-[10px] text-neutral-400 truncate">
                {shift ? shift.address : 'смена закрыта'}
              </span>
            </div>
            <button
              type="button"
              onClick={async () => {
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
                className={`rounded-lg py-1.5 text-[11px] font-medium transition ${
                  tab === t.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
              >
                {t.label}
                {t.id === 'work' && (unread_new > 0 || in_work.length > 0) ? (
                  <span
                    className={`ml-0.5 inline-flex min-w-[1rem] justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
                      unread_new > 0
                        ? 'bg-accent text-white animate-pulse'
                        : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {unread_new > 0 ? unread_new : in_work.length}
                  </span>
                ) : null}
                {t.id === 'ready' && handed_out.length ? (
                  <span className="ml-0.5 text-[9px] text-neutral-400">{handed_out.length}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main
        className={`flex-1 min-h-0 w-full ${
          tab === 'pos' ? 'px-2 py-2 flex flex-col' : 'max-w-3xl mx-auto px-4 py-4'
        }`}
      >
        {tab === 'work' ? render_work_list() : null}
        {tab === 'ready' ? render_handed_list() : null}

        {tab === 'pos'
          ? createElement(pos_panel, {
              on_created: () => {
                set_tab('work');
                void load();
              },
            })
          : null}

        {tab === 'analytics'
          ? createElement(barista_analytics_panel, {
              seller_id,
              seller_name,
            })
          : null}
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
