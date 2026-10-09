'use client';

import { useCallback, useEffect, useRef, useState, createElement, type ReactNode } from 'react';
import { create_client } from '@/lib/supabase/client';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session, create_demo_user } from '@/lib/demo-auth';
import { useRouter } from 'next/navigation';
import { DEFAULT_PREP_MINUTES } from '@/lib/kitchen-queue';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import { format_order_number, moscow_today_iso } from '@/lib/order-number';
import {
  play_drink_ready_chime,
  play_handout_chime,
  play_payment_chime,
  play_start_chime,
  play_task_done_chime,
  play_timer_alarm,
} from '@/lib/order-chime';
import { get_active_spots, get_spots } from '@/lib/spot-store';
import { use_page_swipe } from '@/lib/use-page-swipe';
import type {
  cash_transaction,
  order,
  order_item,
  seller_shift_record,
  store_spot,
} from '@/lib/types';
import cash_register_modal from '@/components/seller/cash-register-modal';
import barista_analytics_panel from '@/components/seller/barista-analytics';
import barista_login_sheet from '@/components/seller/barista-login-sheet';
import pos_panel from '@/components/seller/pos-panel';
import seller_inventory from '@/components/seller/seller-inventory';
import drink_cook_guide from '@/components/seller/drink-cook-guide';
import task_guide from '@/components/seller/task-guide';
import shift_task_card from '@/components/seller/shift-task-card';
import opening_task_card from '@/components/seller/opening-task-card';
import opening_task_guide from '@/components/seller/opening-task-guide';
import closing_task_card from '@/components/seller/closing-task-card';
import closing_task_guide from '@/components/seller/closing-task-guide';
import { type opening_task } from '@/lib/opening-checklist';
import { type closing_task } from '@/lib/closing-checklist';
import { should_show_checklist_at } from '@/lib/shift-checklist-templates';
import order_prep_card, {
  type drink_row,
  type prep_state,
} from '@/components/seller/order-prep-card';
import order_revise_sheet from '@/components/seller/order-revise-sheet';
import type { day_task_template } from '@/lib/day-task-templates';
import {
  apply_day_templates,
  get_board_tasks,
  mark_appeared,
  press_day_task,
  type day_task,
} from '@/lib/seller-day-tasks';
import { board_tile_grid } from '@/lib/seller-tile-grid';
import { default_seller_access, type seller_access, type seller_right } from '@/lib/seller-access';
import drink_craft from '@/components/seller/drink-craft';
import business_pulse from '@/components/seller/business-pulse';

const seller_panes = [
  { id: 'work', label: 'в работе', right: 'work' },
  { id: 'ready', label: 'готовые', right: 'ready' },
  { id: 'pos', label: 'касса', right: 'pos' },
  { id: 'stock', label: 'склад', right: 'stock' },
  { id: 'craft', label: 'крафт', right: 'craft' },
  { id: 'analytics', label: 'аналитика', right: 'analytics' },
  { id: 'business', label: 'бизнес', right: 'business' },
] as const satisfies readonly { id: string; label: string; right: seller_right }[];
type tab = (typeof seller_panes)[number]['id'];

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

function board_day() {
  return moscow_today_iso();
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
  return list.map((o) => {
    const already =
      Boolean(o.is_paid) ||
      paid.has(o.id) ||
      o.payment_type === 'bonus' ||
      (o.payment_type === 'online' && Number(o.total_price) === 0);
    return already ? { ...o, is_paid: true } : o;
  });
}

function order_is_paid(o: order) {
  return (
    Boolean(o.is_paid) ||
    o.payment_type === 'bonus' ||
    (o.payment_type === 'online' && Number(o.total_price) === 0)
  );
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
    JSON.stringify({ day, orders: list.slice(0, 200) })
  );
}

function load_shift(): seller_shift | null {
  try {
    const raw = sessionStorage.getItem(shift_key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<seller_shift>;
    if (!parsed?.spot_id) return null;
    return {
      id: parsed.id || `spot-${parsed.spot_id}-${parsed.shift_date || moscow_today_iso()}`,
      spot_id: parsed.spot_id,
      address: parsed.address || '',
      city: parsed.city || '',
      opened_at: parsed.opened_at || '',
      shift_date: parsed.shift_date || moscow_today_iso(),
    };
  } catch {
    return null;
  }
}

function apply_server_shift(
  current: seller_shift | null,
  server: seller_shift_record
): seller_shift {
  return {
    id: server.id,
    spot_id: server.spot_id,
    address: server.spot_address || current?.address || '',
    city: server.spot_city || current?.city || '',
    opened_at: server.opened_at,
    shift_date: server.shift_date,
  };
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
    const normalized = normalize_order_item_fields({ name: item.name, volume: item.volume });
    for (let q = 0; q < item.quantity; q++) {
      rows.push({
        key: `${o.id}:${item.menu_id}:${normalized.volume ?? ''}:${item.temp ?? ''}:${q}`,
        name: normalized.name,
        menu_id: item.menu_id,
        prep_minutes: prep_by_menu.get(item.menu_id) || DEFAULT_PREP_MINUTES,
        volume: normalized.volume,
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
        <h2 className="text-xl font-bold text-neutral-900">точка работы</h2>
        <p className="text-sm text-neutral-500 mt-1 mb-4">
          смена откроется после чек-листа открытия, не при выборе точки
        </p>
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
  const [rights, set_rights] = useState<seller_access>(default_seller_access);
  const [orders, set_orders] = useState<order[]>([]);
  const [schedule_lines, set_schedule_lines] = useState<schedule_line[]>([]);
  const [paying, set_paying] = useState<order | null>(null);
  const [seller_id, set_seller_id] = useState('');
  const [seller_name, set_seller_name] = useState('бариста');
  const [shift, set_shift] = useState<seller_shift | null>(null);
  const [shift_spots, set_shift_spots] = useState<store_spot[]>([]);
  const [need_shift, set_need_shift] = useState(false);
  const [need_barista, set_need_barista] = useState(false);
  const [switch_barista_open, set_switch_barista_open] = useState(false);
  const [barista_busy, set_barista_busy] = useState(false);
  const [barista_error, set_barista_error] = useState('');
  const [shift_busy, set_shift_busy] = useState(false);
  const [prep_map, set_prep_map] = useState<Record<string, Record<string, prep_state>>>({});
  const [order_starts, set_order_starts] = useState<Record<string, number>>({});
  const [handed, set_handed] = useState<order[]>([]);
  const [cook, set_cook] = useState<{ order: order; drink_key: string } | null>(null);
  const [revising, set_revising] = useState<order | null>(null);
  const [revise_busy, set_revise_busy] = useState(false);
  const [revise_error, set_revise_error] = useState('');
  const [task_guide_id, set_task_guide_id] = useState<string | null>(null);
  const [day_tasks, set_day_tasks] = useState<day_task[]>([]);
  const [task_templates, set_task_templates] = useState<day_task_template[] | null>(null);
  const [opening_task_state, set_opening_task_state] = useState<opening_task | null>(null);
  const [opening_guide_open, set_opening_guide_open] = useState(false);
  const [closing_task_state, set_closing_task_state] = useState<closing_task | null>(null);
  const [closing_guide_open, set_closing_guide_open] = useState(false);
  const [checklist_meta, set_checklist_meta] = useState({
    opening_at: '11:00',
    closing_at: '20:00',
  });
  const [fresh_ids, set_fresh_ids] = useState<Set<string>>(new Set());
  const [unread_new, set_unread_new] = useState(0);
  const [pos_depth, set_pos_depth] = useState(false);
  const [stock_depth, set_stock_depth] = useState(false);
  const known_ids = useRef<Set<string> | null>(null);
  const pending_blink_ref = useRef<Set<string>>(new Set());
  const seller_ref = useRef({ id: '', name: 'бариста' });
  const schedule_ref = useRef<schedule_line[]>([]);
  const alarm_timer = useRef<number | null>(null);
  const tab_ref = useRef(tab);
  const shift_date_ref = useRef(shift?.shift_date);
  const seller_id_ref = useRef(seller_id);
  const load_gen = useRef(0);
  const load_inflight = useRef<Promise<void> | null>(null);
  const load_queued = useRef(false);
  const empty_board_streak = useRef(0);
  const handed_day_ref = useRef(moscow_today_iso());
  const sales_sync_ref = useRef('');
  shift_date_ref.current = shift?.shift_date;
  seller_id_ref.current = seller_id;
  const panes = seller_panes.filter((pane) => rights[pane.right]);
  const tab_index = panes.findIndex((pane) => pane.id === tab);

  const { viewport_ref, page_style, width: board_w, height: board_h } = use_page_swipe({
    index: Math.max(0, tab_index),
    count: Math.max(1, panes.length),
    enabled: !paying && !cook && !revising && !task_guide_id && !need_shift && !need_barista && !switch_barista_open && !(tab === 'pos' && pos_depth) && !(tab === 'stock' && stock_depth),
    on_index: (next) => set_tab(panes[next]?.id ?? panes[0]?.id ?? 'work'),
  });

  useEffect(() => {
    let stop = false;
    fetch('/api/seller/access', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((body: { access?: seller_access }) => {
        if (!stop && body.access) set_rights(body.access);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    void fetch('/api/seller/shift-checklists/meta', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { opening_at?: string; closing_at?: string } | null) => {
        if (!data?.opening_at) return;
        set_checklist_meta({
          opening_at: data.opening_at,
          closing_at: data.closing_at || '20:00',
        });
      });
  }, []);

  useEffect(() => {
    const open = seller_panes.filter((pane) => rights[pane.right]);
    if (open.some((pane) => pane.id === tab)) return;
    if (open[0]) set_tab(open[0].id);
  }, [rights, tab]);

  useEffect(() => {
    tab_ref.current = tab;
  }, [tab]);

  useEffect(() => {
    if (tab !== 'pos') set_pos_depth(false);
    if (tab !== 'stock') set_stock_depth(false);
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
    if (load_inflight.current) {
      load_queued.current = true;
      return;
    }

    const run = async () => {
      const gen = ++load_gen.current;
      let list: order[] = [];
      let lines: schedule_line[] = [];
      let board_ok = false;

      const day = board_day();
      const completed_req = fetch(
        `/api/seller/orders?${new URLSearchParams({ completed: '1', day })}`,
        { credentials: 'same-origin' }
      ).catch(() => null);

      try {
        const sched_res = await fetch('/api/kitchen/schedule', { credentials: 'same-origin' });
        if (sched_res.ok) {
          const body = (await sched_res.json()) as {
            lines?: schedule_line[];
            orders?: order[];
          };
          lines = body.lines ?? [];
          if (Array.isArray(body.orders)) {
            list = body.orders;
            board_ok = true;
          }
        }
      } catch {
        /* fallback */
      }

      if (!board_ok) {
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
            board_ok = true;
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
          board_ok = true;
        }

        merged.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        list = merged;
      }

      if (gen !== load_gen.current) return;

      if (list.length === 0 && board_ok) {
        empty_board_streak.current += 1;
      } else if (list.length > 0) {
        empty_board_streak.current = 0;
      }

      schedule_ref.current = lines;
      set_schedule_lines(lines);
      set_orders((prev) => {
        // краткий пустой ответ при гонке записи — не мигаем доской и не спамим пушами
        if (
          list.length === 0 &&
          prev.length > 0 &&
          (!board_ok || empty_board_streak.current < 2)
        ) {
          return prev;
        }
        return with_sticky_paid(list, day);
      });

      const prep_done = hydrate_prep(list, lines);
      const completed: order[] = [];
      const seen_done = new Set<string>();
      let from_server = false;
      const completed_res = await completed_req;
      if (completed_res?.ok) {
        from_server = true;
        const body = (await completed_res.json()) as { orders?: order[] };
        for (const o of body.orders || []) {
          if (seen_done.has(o.id)) continue;
          seen_done.add(o.id);
          completed.push(o);
        }
      }
      await prep_done;
      if (gen !== load_gen.current) return;

      for (const o of load_handed(day)) {
        if (seen_done.has(o.id)) continue;
        seen_done.add(o.id);
        completed.push(o);
      }

      completed.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      set_handed(completed);
      save_handed(day, completed);
      const stamp = completed
        .map((order) => order.id)
        .sort()
        .join(',');
      if (stamp && sales_sync_ref.current !== stamp) {
        sales_sync_ref.current = stamp;
        void fetch('/api/seller/prep-stats', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ kind: 'sales', shift_date: day }),
        }).then((res) => {
          if (!res.ok) sales_sync_ref.current = '';
        }).catch(() => {
          sales_sync_ref.current = '';
        });
      }
    };

    const task = run().finally(() => {
      if (load_inflight.current === task) load_inflight.current = null;
      if (load_queued.current) {
        load_queued.current = false;
        void load();
      }
    });
    load_inflight.current = task;
    await task;
  }, [hydrate_prep]);

  useEffect(() => {
    set_prep_map(load_prep_map());
    set_order_starts(load_order_starts());
    set_handed(load_handed(board_day()));

    function apply_spots(allowed_ids: string[]) {
      const all = get_active_spots();
      const available =
        allowed_ids.length > 0
          ? all.filter((s) => allowed_ids.includes(s.id))
          : all.length
            ? all
            : get_spots();
      set_shift_spots(available.length ? available : get_spots());
    }

    function begin_shift_flow(allowed_ids?: string[]) {
      const existing = load_shift();
      if (existing) {
        set_shift(existing);
        set_need_shift(false);
        return;
      }
      let ids = allowed_ids;
      if (!ids) {
        try {
          ids = JSON.parse(
            sessionStorage.getItem('yoboba_seller_spot_ids') || '[]'
          ) as string[];
        } catch {
          ids = [];
        }
      }
      apply_spots(ids || []);
      set_need_shift(true);
    }

    const user = get_demo_user();
    if (user && user.id && user.id !== 'pos-terminal') {
      set_seller_id(user.id);
      set_seller_name(user.name);
      seller_ref.current = { id: user.id, name: user.name };
    }

    void fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { seller_id?: string | null; name?: string | null } | null) => {
        if (!body?.seller_id) {
          set_seller_id('');
          set_seller_name('касса');
          seller_ref.current = { id: '', name: 'касса' };
          set_need_barista(true);
          set_need_shift(false);
          return;
        }
        const name = body.name || 'бариста';
        set_seller_id(body.seller_id);
        set_seller_name(name);
        seller_ref.current = { id: body.seller_id, name };
        set_need_barista(false);
        begin_shift_flow();
      })
      .catch(() => {
        begin_shift_flow();
      });

    void load();
    const poll = window.setInterval(() => void load(), 4000);

    if (is_supabase_configured()) {
      const supabase = create_client();
      const channel = supabase
        .channel('seller-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
          void load()
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
    const ids = orders.map((o) => o.id);
    if (!known_ids.current) {
      known_ids.current = new Set(ids);
      return;
    }
    const newcomers = ids.filter((id) => !known_ids.current!.has(id));
    // только накапливаем — забывание id при мигании доски давало повторные пуши
    for (const id of ids) known_ids.current.add(id);
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

  // Загрузка задачи открытия — только после выбора точки
  useEffect(() => {
    if (!seller_id || !shift?.spot_id) return;
    const spot_id = shift.spot_id;
    const spot_address = shift.address;
    const needs_server_sync = !shift.opened_at || shift.id.startsWith('spot-');

    async function load_opening_task() {
      try {
        const params = new URLSearchParams({
          seller_id,
          spot_id,
          shift_date: board_day(),
        });
        if (spot_address) params.set('spot_address', spot_address);

        const res = await fetch(
          `/api/seller/opening-task?${params}`,
          { credentials: 'same-origin' }
        );

        if (res.ok) {
          const data = (await res.json()) as { task: opening_task };
          set_opening_task_state(data.task);
          if (data.task.completed_at && needs_server_sync) {
            const day_res = await fetch(
              `/api/seller/shifts?spot_id=${encodeURIComponent(spot_id)}&shift_date=${board_day()}&day=1`,
              { credentials: 'same-origin' }
            );
            if (day_res.ok) {
              const day_body = (await day_res.json()) as { shift?: seller_shift_record | null };
              if (day_body.shift) {
                const next = apply_server_shift(load_shift(), day_body.shift);
                save_shift(next);
                set_shift(next);
              }
            }
          }
        }
      } catch {
        // задача открытия не критична
      }
    }

    void load_opening_task();
    const poll = window.setInterval(() => void load_opening_task(), 30_000);
    return () => window.clearInterval(poll);
  }, [seller_id, shift?.spot_id, shift?.shift_date, shift?.address, shift?.id, shift?.opened_at]);

  // Загрузка задачи закрытия — только после выбора точки
  useEffect(() => {
    if (!seller_id || !shift?.spot_id) return;

    async function load_closing_task() {
      try {
        const params = new URLSearchParams({
          seller_id,
          spot_id: shift!.spot_id,
          shift_date: board_day(),
        });
        if (shift!.address) params.set('spot_address', shift!.address);

        const res = await fetch(
          `/api/seller/closing-task?${params}`,
          { credentials: 'same-origin' }
        );

        if (res.ok) {
          const data = (await res.json()) as { task: closing_task };
          set_closing_task_state(data.task);
        }
      } catch {
        // задача закрытия не критична
      }
    }

    void load_closing_task();
    const poll = window.setInterval(() => void load_closing_task(), 30_000);
    return () => window.clearInterval(poll);
  }, [seller_id, shift?.spot_id, shift?.shift_date, shift?.address]);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const res = await fetch('/api/seller/day-tasks', { credentials: 'same-origin' });
        if (!res.ok) return;
        const body = (await res.json()) as { tasks?: day_task_template[] };
        if (!stop && Array.isArray(body.tasks)) set_task_templates(body.tasks);
      } catch {
        /* задачи дня появятся на следующем заходе */
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!shift?.spot_id) {
      set_day_tasks([]);
      return;
    }
    if (!task_templates) return;
    const spot = shift.spot_id;
    const templates = task_templates;
    function sync() {
      const today = moscow_today_iso();
      const loaded = apply_day_templates(spot, templates, today);
      set_day_tasks(mark_appeared(spot, loaded, new Date(), today));
      if (handed_day_ref.current !== today) {
        handed_day_ref.current = today;
        set_handed([]);
        save_handed(today, []);
        void load();
      }
    }
    handed_day_ref.current = moscow_today_iso();
    sync();
    const id = window.setInterval(sync, 30_000);
    return () => window.clearInterval(id);
  }, [shift?.spot_id, task_templates, load]);

  function press_task(task_id: string) {
    if (!shift?.spot_id) return;
    const next = press_day_task(shift.spot_id, task_id, moscow_today_iso());
    const pressed = next.find((t) => t.id === task_id);
    if (pressed?.phase === 'done') {
      play_task_done_chime();
      set_task_guide_id(null);
    }
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
      mark_order_paid_local(id, board_day());
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
        if (patch.is_paid || load_paid_ids(board_day()).has(id) || o.is_paid || server?.is_paid) {
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
            shift_date: board_day(),
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

  async function complete_payment(
    payment_method: 'cash' | 'card' | 'bonus',
    amount_received?: number
  ) {
    if (!paying) return;
    const total = payment_method === 'bonus' ? 0 : Number(paying.total_price);
    const change =
      payment_method === 'cash' && amount_received != null
        ? Math.max(0, amount_received - Number(paying.total_price))
        : null;

    const sid = seller_id || seller_ref.current.id || 'seller';
    const sname = seller_name || seller_ref.current.name || 'бариста';

    if (payment_method === 'bonus') {
      const redeem_res = await fetch('/api/seller/redeem-bonus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          phone: paying.customer_phone,
          user_id: paying.user_id,
          order_id: paying.id,
        }),
      });
      if (!redeem_res.ok) {
        const body = (await redeem_res.json().catch(() => null)) as { error?: string } | null;
        alert(body?.error || 'не удалось списать бобаллы');
        return;
      }
    }

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
      shift_date: board_day(),
      created_at: new Date().toISOString(),
      spot_id: shift?.spot_id || null,
      spot_address: shift?.address || null,
      shift_id: shift?.id && !shift.id.startsWith('spot-') ? shift.id : null,
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

    const patch_payment: Partial<order> = {
      is_paid: true,
      payment_type: payment_method === 'bonus' ? 'bonus' : payment_method,
      status: 'ready',
    };

    try {
      await patch_order(paying.id, patch_payment);
      mark_order_paid_local(paying.id, board_day());
    } catch (e) {
      // касса уже провела оплату — держим «выдать» локально даже если PATCH частично упал
      mark_order_paid_local(paying.id, board_day());
      set_orders((prev) =>
        prev.map((o) => (o.id === paying.id ? { ...o, ...patch_payment } : o))
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
    const day = board_day();
    const done: order = { ...o, status: 'completed', is_paid: o.is_paid ?? true };

    play_handout_chime();
    set_handed((prev) => {
      const next = [done, ...prev.filter((x) => x.id !== o.id)].slice(0, 200);
      save_handed(day, next);
      return next;
    });
    set_orders((prev) => prev.filter((row) => row.id !== o.id));
    clear_prep_on_server(o.id);
    const map = load_prep_map();
    delete map[o.id];
    save_prep_map(map);
    set_prep_map(map);

    try {
      await Promise.all([
        fetch('/api/seller/prep-stats', {
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
        }).then(async (fulfill_res) => {
          if (!fulfill_res.ok) {
            const body = (await fulfill_res.json().catch(() => null)) as { error?: string } | null;
            console.warn(body?.error || 'не удалось записать выдачу в журнал');
          }
        }),
        patch_order(o.id, { status: 'completed' }),
      ]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'не удалось выдать заказ');
      set_orders((prev) => (prev.some((row) => row.id === o.id) ? prev : [o, ...prev]));
      set_handed((prev) => prev.filter((row) => row.id !== o.id));
    }
  }

  function on_final_action(o: order) {
    set_cook(null);
    if (!order_is_paid(o)) {
      set_paying(o);
      return;
    }
    void hand_out(o);
  }

  function drop_order_locally(id: string) {
    set_orders((prev) => prev.filter((row) => row.id !== id));
    set_handed((prev) => {
      const next = prev.filter((row) => row.id !== id);
      save_handed(board_day(), next);
      return next;
    });
    set_prep_map((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      save_prep_map(next);
      return next;
    });
    if (cook?.order.id === id) set_cook(null);
    if (paying?.id === id) set_paying(null);
  }

  function replace_order_locally(next: order) {
    set_orders((prev) => prev.map((row) => (row.id === next.id ? { ...row, ...next } : row)));
    set_handed((prev) => {
      const list = prev.map((row) =>
        row.id === next.id ? { ...row, ...next, status: row.status } : row
      );
      save_handed(board_day(), list);
      return list;
    });
  }

  async function delete_order_card(o: order) {
    if (!window.confirm(`удалить заказ №${format_order_number(o)} из системы?`)) return;
    set_revise_busy(true);
    try {
      const res = await fetch('/api/seller/orders/revise', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: o.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(body.error || 'не удалось удалить заказ');
        return;
      }
      drop_order_locally(o.id);
      set_revising(null);
    } catch {
      window.alert('не удалось удалить заказ');
    } finally {
      set_revise_busy(false);
    }
  }

  async function save_order_card(items: order_item[]) {
    if (!revising) return;
    set_revise_busy(true);
    set_revise_error('');
    try {
      const res = await fetch('/api/seller/orders/revise', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', id: revising.id, items }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; order?: order };
      if (!res.ok || !body.order) {
        set_revise_error(body.error || 'не удалось сохранить заказ');
        return;
      }
      replace_order_locally(body.order);
      set_revising(null);
    } catch {
      set_revise_error('не удалось сохранить заказ');
    } finally {
      set_revise_busy(false);
    }
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

  const tabs = panes;

  const { open: open_tasks, done: done_tasks } = get_board_tasks(day_tasks);
  
  // Добавить задачу открытия, если время пришло и она не завершена
  const show_opening =
    opening_task_state && should_show_checklist_at(checklist_meta.opening_at) && !opening_task_state.completed_at;
  const opening_is_done = opening_task_state?.completed_at != null;
  
  // Добавить задачу закрытия, если время пришло и она не завершена
  const show_closing =
    closing_task_state && should_show_checklist_at(checklist_meta.closing_at) && !closing_task_state.completed_at;
  const closing_is_done = closing_task_state?.completed_at != null;

  const work_board_count =
    in_work.length + open_tasks.length + (show_opening ? 1 : 0) + (show_closing ? 1 : 0);
  const ready_board_count =
    handed_out.length + done_tasks.length + (opening_is_done ? 1 : 0) + (closing_is_done ? 1 : 0);
  const guided_task = day_tasks.find((t) => t.id === task_guide_id) ?? null;
  /** бейдж «готовые» = число выдач, как в аналитике (задачи смены не считаем) */
  const ready_handout_count = handed_out.length;

  function render_fill_grid(count: number, children: ReactNode) {
    if (count === 0) return null;
    const { cols, rows } = board_tile_grid(
      count,
      Math.max(0, board_w - 16),
      Math.max(0, board_h - 16),
    );
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
        {show_opening && opening_task_state
          ? createElement(opening_task_card, {
              key: 'opening-task',
              task: opening_task_state,
              on_open: () => set_opening_guide_open(true),
            })
          : null}
        {show_closing && closing_task_state
          ? createElement(closing_task_card, {
              key: 'closing-task',
              task: closing_task_state,
              on_open: () => set_closing_guide_open(true),
            })
          : null}
        {open_tasks.map((t) =>
          createElement(shift_task_card, {
            key: `task-${t.id}`,
            task: t,
            mode: 'work',
            on_open_guide: () => set_task_guide_id(t.id),
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
            on_open_cook: (drink) => set_cook({ order: o, drink_key: drink.key }),
            on_edit: (order) => {
              set_revise_error('');
              set_revising(order);
            },
            on_delete: (order) => void delete_order_card(order),
            guide_open: cook?.order.id === o.id,
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
        {opening_is_done && opening_task_state
          ? createElement(opening_task_card, {
              key: 'opening-task-done',
              task: opening_task_state,
              on_open: () => set_opening_guide_open(true),
            })
          : null}
        {closing_is_done && closing_task_state
          ? createElement(closing_task_card, {
              key: 'closing-task-done',
              task: closing_task_state,
              on_open: () => set_closing_guide_open(true),
            })
          : null}
        {done_tasks.map((t) =>
          createElement(shift_task_card, {
            key: `task-done-${t.id}`,
            task: t,
            mode: 'done',
            on_open_guide: () => set_task_guide_id(t.id),
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
            on_open_cook: (drink) => set_cook({ order: o, drink_key: drink.key }),
            on_edit: (order) => {
              set_revise_error('');
              set_revising(order);
            },
            on_delete: (order) => void delete_order_card(order),
            guide_open: cook?.order.id === o.id,
          })
        )}
      </>
    );
  }

  /** смена точки закрывается только чек-листом; при смене бариста точку оставляем */
  function clear_barista_session_keep_spot() {
    // точка и локальная привязка остаются — следующий бариста продолжит ту же смену точки
  }

  function leave_spot_assignment() {
    sessionStorage.removeItem(shift_key);
    set_shift(null);
    set_need_shift(false);
    set_opening_task_state(null);
    set_closing_task_state(null);
  }

  function sync_from_server_shift(server: seller_shift_record) {
    const next = apply_server_shift(shift, server);
    save_shift(next);
    set_shift(next);
    if (server.closed_at) {
      // точка закрыта чек-листом — локально можно остаться на точке до ухода
    }
  }

  function start_shift_picker(spot_ids: string[]) {
    sessionStorage.setItem('yoboba_seller_spot_ids', JSON.stringify(spot_ids || []));
    const all = get_active_spots();
    const available =
      spot_ids.length > 0
        ? all.filter((s) => spot_ids.includes(s.id))
        : all.length
          ? all
          : get_spots();
    set_shift_spots(available.length ? available : get_spots());
    const existing = load_shift();
    if (existing) {
      set_shift(existing);
      set_need_shift(false);
    } else {
      set_need_shift(true);
    }
  }

  async function submit_barista_login(login: string, password: string) {
    set_barista_busy(true);
    set_barista_error('');
    try {
      const res = await fetch('/api/seller/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ login, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        seller_id?: string;
        name?: string;
        spot_ids?: string[];
        error?: string;
      };
      if (!res.ok || !data.seller_id) {
        set_barista_error(data.error || 'неверный логин или пароль');
        return;
      }
      create_demo_user({
        id: data.seller_id,
        name: data.name || 'бариста',
        role: 'seller',
        force: true,
      });
      set_seller_id(data.seller_id);
      set_seller_name(data.name || 'бариста');
      seller_ref.current = { id: data.seller_id, name: data.name || 'бариста' };
      set_need_barista(false);
      set_switch_barista_open(false);
      start_shift_picker(data.spot_ids || []);
    } catch {
      set_barista_error('ошибка сети');
    } finally {
      set_barista_busy(false);
    }
  }

  async function lock_barista() {
    clear_barista_session_keep_spot();
    await fetch('/api/seller/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'lock' }),
    }).catch(() => {});
    create_demo_user({ id: 'pos-terminal', name: 'касса', role: 'seller', force: true });
    set_seller_id('');
    set_seller_name('касса');
    seller_ref.current = { id: '', name: 'касса' };
    set_need_barista(true);
    set_switch_barista_open(false);
    set_barista_error('');
  }

  return (
    <div className="flex h-[calc(100dvh-var(--safe-top)-var(--safe-bottom))] min-h-0 flex-col bg-[#f0f1f4]">
      {(need_barista || switch_barista_open) &&
        createElement(barista_login_sheet, {
          title: switch_barista_open ? 'сменить бариста' : 'кто на смене',
          subtitle: switch_barista_open
            ? 'войдите логином следующего бариста'
            : 'общий вход в кассу уже есть · теперь ваш логин',
          busy: barista_busy,
          error: barista_error,
          allow_cancel: switch_barista_open,
          on_cancel: () => {
            set_switch_barista_open(false);
            set_barista_error('');
            if (!need_barista && seller_id && !load_shift()) {
              start_shift_picker(
                (() => {
                  try {
                    return JSON.parse(
                      sessionStorage.getItem('yoboba_seller_spot_ids') || '[]'
                    ) as string[];
                  } catch {
                    return [];
                  }
                })()
              );
            }
          },
          on_submit: submit_barista_login,
        })}

      {need_shift &&
        !need_barista &&
        createElement(shift_picker, {
          spots: shift_spots,
          busy: shift_busy,
          on_pick: async (spot) => {
            set_shift_busy(true);
            try {
              const sid = seller_id || seller_ref.current.id;
              if (!sid) {
                set_need_barista(true);
                return;
              }
              const day = board_day();
              const res = await fetch('/api/seller/shifts', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  spot_id: spot.id,
                  shift_date: day,
                  seller_id: sid,
                  seller_name: seller_name || seller_ref.current.name || 'бариста',
                }),
              });
              const body = (await res.json().catch(() => null)) as {
                shift?: seller_shift_record | null;
                error?: string;
              } | null;
              if (!res.ok) {
                alert(body?.error || 'не удалось выбрать точку');
                return;
              }
              if (body?.shift?.closed_at) {
                alert('смена на этой точке уже закрыта — повторное открытие нельзя');
                return;
              }
              const next: seller_shift = body?.shift
                ? apply_server_shift(null, {
                    ...body.shift,
                    spot_address: body.shift.spot_address || spot.address,
                    spot_city: body.shift.spot_city || spot.city,
                  })
                : {
                    id: `spot-${spot.id}-${day}`,
                    spot_id: spot.id,
                    address: spot.address,
                    city: spot.city,
                    opened_at: '',
                    shift_date: day,
                  };
              save_shift(next);
              set_shift(next);
              set_need_shift(false);
              if (task_templates) {
                set_day_tasks(
                  mark_appeared(next.spot_id, apply_day_templates(next.spot_id, task_templates))
                );
              }
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
              <h1 className="text-sm font-bold text-accent truncate">
                {need_barista ? 'не выбран' : seller_name}
              </h1>
              <span className="text-[10px] text-neutral-400 truncate">
                {shift
                  ? `${shift.address}${shift.opened_at ? '' : ' · ждём открытие'}`
                  : 'точка не выбрана'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!need_barista ? (
                <button
                  type="button"
                  onClick={() => {
                    clear_barista_session_keep_spot();
                    set_barista_error('');
                    set_switch_barista_open(true);
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium text-neutral-600"
                >
                  сменить
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  if (need_barista) {
                    await clear_session();
                    router.push('/admin/login');
                    return;
                  }
                  await lock_barista();
                }}
                className="rounded-lg px-2 py-1 text-[10px] font-medium text-neutral-500"
              >
                {need_barista ? 'выйти' : 'заблокировать'}
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex gap-0.5 overflow-x-auto rounded-xl bg-surface p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set_tab(t.id)}
                className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
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
        {panes.map((pane, index) => (
          <div
            key={pane.id}
            className={
              pane.id === 'analytics' || pane.id === 'business'
                ? 'absolute inset-0 overflow-y-auto px-4 py-4'
                : 'absolute inset-0 flex flex-col overflow-hidden px-2 py-2'
            }
            style={page_style(index)}
          >
            {pane.id === 'work' ? render_work_list() : null}
            {pane.id === 'ready' ? render_handed_list() : null}
            {pane.id === 'pos'
              ? createElement(pos_panel, {
                  on_created: () => {
                    set_tab(rights.work ? 'work' : pane.id);
                    void load();
                  },
                  on_nav_depth: set_pos_depth,
                  seller_id,
                  seller_name,
                  shift_id:
                    shift?.id && !shift.id.startsWith('spot-') ? shift.id : null,
                  shift_date: board_day(),
                  spot_id: shift?.spot_id || null,
                  spot_address: shift?.address || null,
                })
              : null}
            {pane.id === 'stock'
              ? createElement(seller_inventory, {
                  on_nav_depth: set_stock_depth,
                  active: tab === 'stock',
                })
              : null}
            {pane.id === 'craft' ? createElement(drink_craft) : null}
            {pane.id === 'analytics'
              ? createElement(barista_analytics_panel, {
                  seller_id,
                  seller_name,
                  spot_id: shift?.spot_id,
                  shift_id: shift?.id && !shift.id.startsWith('spot-') ? shift.id : undefined,
                  shift_date: board_day(),
                })
              : null}
            {pane.id === 'business' ? createElement(business_pulse) : null}
          </div>
        ))}
      </main>

      {createElement(cash_register_modal, {
        order: paying,
        seller_name,
        on_close: () => set_paying(null),
        on_complete: complete_payment,
      })}
      {cook
        ? createElement(drink_cook_guide, {
            drinks: drinks_for(cook.order).map((d) => ({
              ...d,
              done: Boolean(prep_map[cook.order.id]?.[d.key]?.done),
              started: Boolean(prep_map[cook.order.id]?.[d.key]?.started_at),
            })),
            start_key: cook.drink_key,
            on_start_drink: (drink) => {
              const st = prep_map[cook.order.id]?.[drink.key];
              if (st?.done || st?.started_at) return;
              start_drink(cook.order.id, drink);
            },
            on_mark_drink_done: (drink) => {
              if (prep_map[cook.order.id]?.[drink.key]?.done) return;
              const started =
                prep_map[cook.order.id]?.[drink.key]?.started_at || Date.now();
              mark_drink_done(cook.order.id, drink, {
                actual_ms: Math.max(1000, Date.now() - started),
                expected_ms: drink.prep_minutes * 60_000,
                started_at: started,
              });
            },
            on_close: () => set_cook(null),
          })
        : null}
      {revising
        ? createElement(order_revise_sheet, {
            key: revising.id,
            order: revising,
            busy: revise_busy,
            error: revise_error,
            on_close: () => {
              if (revise_busy) return;
              set_revising(null);
            },
            on_save: (items) => void save_order_card(items),
          })
        : null}
      {guided_task
        ? createElement(task_guide, {
            task: guided_task,
            spot_id: shift?.spot_id || '',
            on_press: () => press_task(guided_task.id),
            on_close: () => set_task_guide_id(null),
          })
        : null}
      {opening_guide_open && opening_task_state
        ? createElement(opening_task_guide, {
            task: opening_task_state,
            seller_id: seller_id || seller_ref.current.id || 'seller',
            seller_name: seller_name || seller_ref.current.name || 'бариста',
            spot_city: shift?.city,
            on_close: () => set_opening_guide_open(false),
            on_update: (updated) => {
              set_opening_task_state(updated);
              if (updated.completed_at) {
                setTimeout(() => set_opening_guide_open(false), 1500);
              }
            },
            on_shift: (server) => sync_from_server_shift(server),
          })
        : null}
      {closing_guide_open && closing_task_state
        ? createElement(closing_task_guide, {
            task: closing_task_state,
            seller_id: seller_id || seller_ref.current.id || 'seller',
            seller_name: seller_name || seller_ref.current.name || 'бариста',
            on_close: () => set_closing_guide_open(false),
            on_update: (updated) => {
              set_closing_task_state(updated);
              if (updated.completed_at) {
                setTimeout(() => set_closing_guide_open(false), 1500);
              }
            },
            on_shift: (server) => {
              sync_from_server_shift(server);
              if (server.closed_at) {
                // после закрытия — снять точку, без переоткрытия в этот день
                window.setTimeout(() => leave_spot_assignment(), 1600);
              }
            },
          })
        : null}
    </div>
  );
}
