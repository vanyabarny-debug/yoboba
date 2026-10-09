'use client';

import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import push_composer from '@/components/admin/push-composer';
import avatar_circle from '@/components/avatar-circle';
import TapicoinIcon from '@/components/tapicoin-icon';
import { format_phone_display } from '@/lib/phone';
import {
  default_student_expiry_iso,
  is_student_discount_active,
  student_expiry_label,
} from '@/lib/student-discount';
import { DRAWER_INLINE_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import {
  active_orders,
  by_hour_bucket,
  by_weekday,
  drinks_count,
  drinks_per_week_rate,
  HOUR_BUCKET_LABELS,
  peak_index,
  spent_sum,
  top_items as analytics_top_items,
  WEEKDAY_LABELS,
  type activity_mode,
  type analytics_period,
} from '@/lib/customer-analytics';
import {
  apply_published_menu_store,
  get_menu_store,
  resolve_menu_item_image_url,
  subscribe_menu_store,
} from '@/lib/menu-store';
import type { menu_item } from '@/lib/types';

type order_line = {
  menu_id?: string;
  name: string;
  quantity: number;
  price: number;
  volume?: string;
  kind?: 'sale' | 'staff';
};

type line_draft = {
  menu_id: string;
  name: string;
  quantity: string;
  price: string;
  volume?: string;
  kind?: 'sale' | 'staff';
};

type customer_order = {
  id: string;
  created_at: string;
  status: 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  total_price: number;
  payment_type: 'cash' | 'card' | 'online' | 'bonus';
  items: order_line[];
};

type customer_row = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  via: 'vk' | 'телефон' | 'vk и телефон';
  bonus_balance: number;
  has_profile: boolean;
  created_at: string | null;
  avatar_emoji: string | null;
  avatar_url: string | null;
  vk_url: string | null;
  orders_count: number;
  spent: number;
  last_order_at: string | null;
  student_claimed: boolean;
  student_verified: boolean;
  student_verified_at: string | null;
  student_verified_by: string | null;
  student_expires_at: string | null;
  top_items: { name: string; quantity: number }[];
  orders: customer_order[];
};

type payload = {
  customers: customer_row[];
  totals: { users: number; with_orders: number; orders: number; spent: number };
  error?: string;
};

const status_label: Record<customer_order['status'], string> = {
  new: 'новый',
  preparing: 'готовим',
  ready: 'готов',
  completed: 'выдан',
  cancelled: 'отменён',
};

const payment_label: Record<customer_order['payment_type'], string> = {
  cash: 'наличными',
  card: 'картой',
  online: 'онлайн',
  bonus: 'бобаллами',
};

function format_when(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function recount_customer(c: customer_row, orders: customer_order[]): customer_row {
  const active = orders.filter((o) => o.status !== 'cancelled');
  const qty = new Map<string, { name: string; quantity: number }>();
  for (const o of active) {
    for (const item of o.items) {
      const { name } = normalize_order_item_fields({ name: item.name, volume: item.volume });
      const key = item.menu_id || name.toLowerCase();
      const prev = qty.get(key) || { name, quantity: 0 };
      prev.name = name;
      prev.quantity += item.quantity;
      qty.set(key, prev);
    }
  }
  const last = orders.reduce<string | null>(
    (best, o) => (!best || o.created_at > best ? o.created_at : best),
    null
  );
  return {
    ...c,
    orders,
    orders_count: active.length,
    spent: Math.round(active.reduce((sum, o) => sum + o.total_price, 0)),
    last_order_at: last,
    top_items: [...qty.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
  };
}

/** миниатюра напитка для карточки клиента — без обводки, целиком в кадре (фото 2:3) */
function purchase_drink_thumb({ item }: { item?: menu_item | null }) {
  const src = item?.image_url?.trim();
  return (
    <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded-md bg-neutral-50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain object-center" />
      ) : (
        <div className="absolute inset-1.5 rounded-full bg-accent/15" />
      )}
    </div>
  );
}

function last_order_of(c: customer_row): customer_order | null {
  return c.orders.reduce<customer_order | null>(
    (best, o) => (!best || o.created_at > best.created_at ? o : best),
    null
  );
}

/** бирка бобаллов у имени — редактирование по наведению */
function bonus_name_chip({
  c,
  value,
  busy,
  on_change,
  on_save,
}: {
  c: customer_row;
  value: string;
  busy: boolean;
  on_change: (raw: string) => void;
  on_save: () => void;
}) {
  const dirty = value !== String(c.bonus_balance);
  const can_edit = c.has_profile;

  return (
    <span className="relative inline-flex group/bonus" data-stop-collapse>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#0039A6] py-1 pl-1 pr-2.5 text-white shadow-sm"
        aria-label={`бобаллы ${c.bonus_balance}`}
      >
        {createElement(TapicoinIcon, { size: 22, className: '!ring-white/40' })}
        <span className="text-sm font-bold tabular-nums leading-none">{c.bonus_balance}</span>
      </button>
      {can_edit ? (
        <span
          role="dialog"
          aria-label="редактировать бобаллы"
          className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-48 rounded-2xl border border-neutral-200 bg-white p-3 opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.14)] transition group-hover/bonus:pointer-events-auto group-hover/bonus:visible group-hover/bonus:opacity-100 group-focus-within/bonus:pointer-events-auto group-focus-within/bonus:visible group-focus-within/bonus:opacity-100"
        >
          <p className="text-xs font-semibold text-neutral-500">бобаллы</p>
          <div className="mt-1.5 flex items-center gap-2">
            {createElement(TapicoinIcon, { size: 22 })}
            <input
              type="text"
              inputMode="numeric"
              aria-label={`бобаллы ${c.name}`}
              value={value}
              disabled={busy}
              onChange={(e) => on_change(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  on_save();
                }
              }}
              className="w-full rounded-xl border border-neutral-200 px-2.5 py-1.5 text-right text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-highlight disabled:opacity-50"
            />
          </div>
          {dirty ? (
            <button
              type="button"
              disabled={busy}
              onClick={on_save}
              className="mt-2.5 w-full rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy ? '…' : 'сохранить'}
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** бирка / кнопка студента у имени — попап с датой по наведению */
function student_name_chip({
  c,
  expiry,
  busy,
  on_expiry,
  on_confirm,
  on_revoke,
}: {
  c: customer_row;
  expiry: string;
  busy: boolean;
  on_expiry: (iso: string) => void;
  on_confirm: () => void;
  on_revoke: () => void;
}) {
  const active = is_student_discount_active(c);
  const expired = c.student_verified && !active && Boolean(c.student_expires_at);

  return (
    <span className="relative inline-flex group/student" data-stop-collapse>
      {active ? (
        <button
          type="button"
          className="inline-flex items-center rounded-full bg-sky-500 px-2.5 py-1 text-sm font-semibold text-white shadow-sm"
          aria-label={`студент до ${student_expiry_label(c.student_expires_at)}`}
        >
          студент −30%
        </button>
      ) : (
        <button
          type="button"
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold shadow-sm ${
            expired
              ? 'bg-neutral-300 text-neutral-700'
              : c.student_claimed
                ? 'bg-amber-400 text-neutral-900'
                : 'bg-white/80 text-neutral-600 ring-1 ring-neutral-200'
          }`}
          aria-label="подтвердить студента"
        >
          {expired ? 'срок вышел' : c.student_claimed ? 'студент?' : 'студент'}
        </button>
      )}
      <span
        role="dialog"
        aria-label="студенческая скидка"
        className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-56 rounded-2xl border border-neutral-200 bg-white p-3 opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.14)] transition group-hover/student:pointer-events-auto group-hover/student:visible group-hover/student:opacity-100 group-focus-within/student:pointer-events-auto group-focus-within/student:visible group-focus-within/student:opacity-100"
      >
        <p className="text-xs font-semibold text-neutral-500">студенческий до</p>
        <input
          type="date"
          value={expiry}
          disabled={busy}
          onChange={(e) => on_expiry(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-highlight disabled:opacity-50"
        />
        {active && c.student_expires_at ? (
          <p className="mt-1.5 text-[11px] text-neutral-400">
            сейчас до {student_expiry_label(c.student_expires_at)}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button
            type="button"
            disabled={busy || !expiry}
            onClick={on_confirm}
            className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? '…' : active ? 'обновить срок' : 'подтвердить'}
          </button>
          {c.student_verified || active ? (
            <button
              type="button"
              disabled={busy}
              onClick={on_revoke}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 disabled:opacity-40"
            >
              снять скидку
            </button>
          ) : null}
        </div>
      </span>
    </span>
  );
}

export default function customers_page() {
  const [data, set_data] = useState<payload | null>(null);
  const [error, set_error] = useState('');
  const [query, set_query] = useState('');
  const [only_buyers, set_only_buyers] = useState(false);
  const [open_id, set_open_id] = useState<string | null>(null);
  const [student_busy, set_student_busy] = useState<string | null>(null);
  const [student_expiry_draft, set_student_expiry_draft] = useState<Record<string, string>>({});
  const [bonus_draft, set_bonus_draft] = useState<Record<string, string>>({});
  const [bonus_busy, set_bonus_busy] = useState<string | null>(null);
  const [edit_id, set_edit_id] = useState<string | null>(null);
  const [line_draft, set_line_draft] = useState<line_draft[]>([]);
  const [order_busy, set_order_busy] = useState<string | null>(null);
  const [menu_items, set_menu_items] = useState<menu_item[]>(() => get_menu_store().items);
  const [analytics_period_state, set_analytics_period] = useState<analytics_period>('all');
  const [activity_tab, set_activity_tab] = useState<activity_mode>('days');
  const [push_open, set_push_open] = useState(false);
  const open_card_ref = useRef<HTMLLIElement | null>(null);

  function expiry_value(c: customer_row) {
    return (
      student_expiry_draft[c.id] ||
      c.student_expires_at ||
      default_student_expiry_iso()
    );
  }

  useEffect(() => {
    fetch('/api/admin/customers', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: payload) => {
        if (body.error) {
          set_error(body.error);
          return;
        }
        set_data(body);
      })
      .catch(() => set_error('не удалось загрузить клиентов'));
  }, []);

  useEffect(() => {
    if (!open_id) return;
    const el = open_card_ref.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      // под шапку, не в центр экрана
      el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open_id]);

  useEffect(() => {
    const reload = () => set_menu_items(get_menu_store().items);
    reload();
    void fetch('/api/menu', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { store?: ReturnType<typeof get_menu_store> | null } | null) => {
        if (!body?.store?.items?.length) return;
        apply_published_menu_store(body.store);
        reload();
      })
      .catch(() => {});
    return subscribe_menu_store(reload);
  }, []);

  const menu_by_id = useMemo(() => {
    const map = new Map<string, menu_item>();
    for (const item of menu_items) map.set(item.id, item);
    return map;
  }, [menu_items]);

  const menu_by_name = useMemo(() => {
    const map = new Map<string, menu_item>();
    for (const item of menu_items) {
      const key = item.name.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, item);
    }
    return map;
  }, [menu_items]);

  function drink_for_line(line: { menu_id?: string; name: string; volume?: string }): menu_item | null {
    const by_id = line.menu_id ? menu_by_id.get(line.menu_id) : null;
    if (by_id) {
      return {
        ...by_id,
        image_url: resolve_menu_item_image_url(by_id) || by_id.image_url,
      };
    }
    const { name } = normalize_order_item_fields({ name: line.name, volume: line.volume });
    const by_name = menu_by_name.get(name.trim().toLowerCase());
    if (!by_name) return null;
    return {
      ...by_name,
      image_url: resolve_menu_item_image_url(by_name) || by_name.image_url,
    };
  }

  const filtered = useMemo(() => {
    const list = data?.customers ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((c) => {
      if (only_buyers && c.orders_count === 0) return false;
      if (!q) return true;
      const hay = [c.name, c.phone, format_phone_display(c.phone), c.via, c.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, query, only_buyers]);

  async function set_student(c: customer_row, verified: boolean) {
    set_student_busy(c.id);
    try {
      const res = await fetch('/api/staff/student-discount', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: c.id.startsWith('guest:') ? undefined : c.id,
          phone: c.phone,
          verified,
          expires_at: verified ? expiry_value(c) : undefined,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        student_claimed?: boolean;
        student_verified?: boolean;
        student_verified_at?: string | null;
        student_verified_by?: string | null;
        student_expires_at?: string | null;
      };
      if (!res.ok) {
        set_error(body.error || 'не удалось обновить статус студента');
        return;
      }
      set_data((prev) =>
        prev
          ? {
              ...prev,
              customers: prev.customers.map((row) =>
                row.id === c.id
                  ? {
                      ...row,
                      student_claimed: body.student_claimed === true,
                      student_verified: body.student_verified === true,
                      student_verified_at: body.student_verified_at || null,
                      student_verified_by: body.student_verified_by || null,
                      student_expires_at: body.student_expires_at || null,
                    }
                  : row
              ),
            }
          : prev
      );
      set_student_expiry_draft((prev) => {
        if (!(c.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[c.id];
        return copy;
      });
    } catch {
      set_error('не удалось обновить статус студента');
    } finally {
      set_student_busy(null);
    }
  }

  function start_edit(o: customer_order) {
    set_edit_id(o.id);
    set_line_draft(
      o.items.map((item) => {
        const normalized = normalize_order_item_fields({ name: item.name, volume: item.volume });
        return {
          menu_id: item.menu_id || '',
          name: normalized.name,
          quantity: String(item.quantity),
          price: String(item.price),
          volume: normalized.volume,
          kind: item.kind,
        };
      })
    );
    set_error('');
  }

  function apply_orders(customer_id: string, orders: customer_order[]) {
    set_data((prev) => {
      if (!prev) return prev;
      const customers = prev.customers.map((row) =>
        row.id === customer_id ? recount_customer(row, orders) : row
      );
      return {
        ...prev,
        customers,
        totals: {
          ...prev.totals,
          with_orders: customers.filter((row) => row.orders.length > 0).length,
          orders: customers.reduce((n, row) => n + row.orders.length, 0),
          spent: customers.reduce((n, row) => n + row.spent, 0),
        },
      };
    });
  }

  async function save_order(c: customer_row, o: customer_order) {
    const items = line_draft.map((line) => {
      const normalized = normalize_order_item_fields({
        name: line.name.trim(),
        volume: line.volume,
      });
      return {
        menu_id: line.menu_id,
        name: normalized.name,
        quantity: Number(line.quantity),
        price: Number(line.price),
        ...(normalized.volume ? { volume: normalized.volume } : {}),
        ...(line.kind ? { kind: line.kind } : {}),
      };
    });
    set_order_busy(o.id);
    set_error('');
    try {
      const res = await fetch('/api/admin/customers/orders', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: o.id, items, status: o.status }),
      });
      const body = (await res.json()) as {
        error?: string;
        order?: { items?: order_line[]; total_price?: number; status?: customer_order['status'] };
      };
      if (!res.ok || !body.order) {
        set_error(body.error || 'не удалось сохранить покупку');
        return;
      }
      const saved = body.order;
      const next_items = Array.isArray(saved.items) ? saved.items : items;
      const next_orders = c.orders.map((row) =>
        row.id === o.id
          ? {
              ...row,
              items: next_items.map((item) => ({
                menu_id: item.menu_id || '',
                name: item.name,
                quantity: Number(item.quantity) || 0,
                price: Number(item.price) || 0,
                ...(item.volume ? { volume: item.volume } : {}),
                ...(item.kind ? { kind: item.kind } : {}),
              })),
              total_price: Number(saved.total_price) || 0,
              status: saved.status || row.status,
            }
          : row
      );
      apply_orders(c.id, next_orders);
      set_edit_id(null);
    } catch {
      set_error('не удалось сохранить покупку');
    } finally {
      set_order_busy(null);
    }
  }

  async function remove_order(c: customer_row, o: customer_order) {
    if (!window.confirm('убрать эту покупку? бобаллы гостя останутся как есть')) return;
    set_order_busy(o.id);
    set_error('');
    try {
      const res = await fetch('/api/admin/customers/orders', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: o.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось убрать покупку');
        return;
      }
      apply_orders(
        c.id,
        c.orders.filter((row) => row.id !== o.id)
      );
      if (edit_id === o.id) set_edit_id(null);
    } catch {
      set_error('не удалось убрать покупку');
    } finally {
      set_order_busy(null);
    }
  }

  function bonus_value(c: customer_row) {
    return bonus_draft[c.id] ?? String(c.bonus_balance);
  }

  async function save_bonus(c: customer_row) {
    const raw = bonus_value(c).trim();
    const next = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(next) || next < 0 || next > 100_000) {
      set_error('укажите целое число от 0 до 100000');
      return;
    }
    if (next === c.bonus_balance) {
      set_bonus_draft((prev) => {
        if (!(c.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[c.id];
        return copy;
      });
      return;
    }
    set_bonus_busy(c.id);
    set_error('');
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: c.id, bonus_balance: next }),
      });
      const body = (await res.json()) as { error?: string; bonus_balance?: number };
      if (!res.ok || typeof body.bonus_balance !== 'number') {
        set_error(body.error || 'не удалось сохранить бобаллы');
        return;
      }
      set_data((prev) =>
        prev
          ? {
              ...prev,
              customers: prev.customers.map((row) =>
                row.id === c.id ? { ...row, bonus_balance: body.bonus_balance ?? next } : row
              ),
            }
          : prev
      );
      set_bonus_draft((prev) => {
        if (!(c.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[c.id];
        return copy;
      });
    } catch {
      set_error('не удалось сохранить бобаллы');
    } finally {
      set_bonus_busy(null);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">клиенты</h2>
          <p className="text-sm text-neutral-500">
            кто вошёл через vk или указал телефон — и что заказывал
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => set_push_open((v) => !v)}
            aria-expanded={push_open}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900">
                отправить пуш-уведомления
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                рассылка гостям, у кого включены уведомления
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className={`shrink-0 text-neutral-400 transition-transform ${
                push_open ? 'rotate-180' : ''
              }`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {push_open ? (
            <div className="border-t border-neutral-100 px-4 py-4">
              {createElement(push_composer)}
            </div>
          ) : null}
        </div>

        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
              <p className="text-xs text-neutral-500">всего</p>
              <p className="text-xl font-bold tabular-nums">{data.totals.users}</p>
            </div>
            <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
              <p className="text-xs text-neutral-500">с покупками</p>
              <p className="text-xl font-bold tabular-nums">{data.totals.with_orders}</p>
            </div>
            <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
              <p className="text-xs text-neutral-500">заказов</p>
              <p className="text-xl font-bold tabular-nums">{data.totals.orders}</p>
            </div>
            <div className="rounded-2xl bg-white border border-neutral-200/80 p-3 shadow-sm">
              <p className="text-xs text-neutral-500">сумма покупок</p>
              <p className="text-xl font-bold tabular-nums">
                {data.totals.spent.toLocaleString('ru-RU')} ₽
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => set_query(e.target.value)}
            placeholder="поиск по имени или телефону"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
          />
          <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={only_buyers}
              onChange={(e) => set_only_buyers(e.target.checked)}
              className="accent-neutral-900"
            />
            только с покупками
          </label>
        </div>

        {error && (
          <p className="rounded-xl border border-surface bg-white p-3 text-sm text-accent">
            {error}
          </p>
        )}

        {!data && !error && (
          <p className="py-8 text-center text-sm text-neutral-400">загрузка…</p>
        )}

        {data && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-400">никого не нашли</p>
        )}

        <ul className="space-y-3">
          {filtered.map((c) => {
            const open = open_id === c.id;

            if (open) {
              return (
                <li
                  key={c.id}
                  ref={open_card_ref}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    const t = e.target as HTMLElement | null;
                    if (
                      t?.closest(
                        'button, a, input, select, textarea, label, [data-stop-collapse]'
                      )
                    ) {
                      return;
                    }
                    set_open_id(null);
                    set_edit_id(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    if ((e.target as HTMLElement) !== e.currentTarget) return;
                    e.preventDefault();
                    set_open_id(null);
                    set_edit_id(null);
                  }}
                  className="customer-card-open scroll-mt-[4.5rem] cursor-pointer rounded-2xl border border-amber-200/80 bg-[#FFF8EE] px-3 py-3 shadow-[0_6px_18px_rgba(120,80,20,0.06)] sm:px-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {createElement(avatar_circle, {
                        emoji: c.avatar_emoji,
                        image_url: c.avatar_url,
                        user_id: c.id.startsWith('guest:') ? null : c.id,
                        size: 'sm',
                      })}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-heading-soft text-lg font-bold tracking-tight text-neutral-900 sm:text-xl">
                            {c.name}
                          </h3>
                          {createElement(bonus_name_chip, {
                            c,
                            value: bonus_value(c),
                            busy: bonus_busy === c.id,
                            on_change: (raw: string) =>
                              set_bonus_draft((prev) => ({ ...prev, [c.id]: raw })),
                            on_save: () => void save_bonus(c),
                          })}
                          {createElement(student_name_chip, {
                            c,
                            expiry: expiry_value(c),
                            busy: student_busy === c.id,
                            on_expiry: (iso: string) =>
                              set_student_expiry_draft((prev) => ({ ...prev, [c.id]: iso })),
                            on_confirm: () => void set_student(c, true),
                            on_revoke: () => void set_student(c, false),
                          })}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          {format_phone_display(c.phone) ? (
                            <span className="font-medium tabular-nums text-neutral-600">
                              {format_phone_display(c.phone)}
                            </span>
                          ) : null}
                          {c.vk_url ? (
                            <a
                              href={c.vk_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-accent hover:underline"
                            >
                              vk
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="закрыть"
                      onClick={() => {
                        set_open_id(null);
                        set_edit_id(null);
                      }}
                      className={DRAWER_INLINE_CLOSE_BTN_CLASS}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.85fr)] sm:items-start">
                    <div className="min-w-0 space-y-1.5">
                      <h4 className="font-heading-soft text-xs font-bold uppercase tracking-wide text-neutral-700">
                        Покупки
                      </h4>
                      {c.orders.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-neutral-200 bg-white px-2.5 py-2 text-xs text-neutral-400">
                          заказов ещё не было
                        </p>
                      ) : (
                        <div className="max-h-[min(48vh,360px)] overflow-y-auto overscroll-contain rounded-lg bg-transparent [scrollbar-width:thin]">
                        <ul className="space-y-1.5">
                          {c.orders.map((o) => {
                            const editing = edit_id === o.id;
                            const draft_total = line_draft.reduce(
                              (sum, line) =>
                                sum +
                                (Number(line.price) || 0) * (Number(line.quantity) || 0),
                              0
                            );
                            return (
                              <li
                                key={o.id}
                                className="rounded-lg border border-neutral-200/80 bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]"
                              >
                              {editing ? (
                                <div className="space-y-2" data-stop-collapse>
                                  {line_draft.map((line, i) => (
                                      <div
                                        key={`${o.id}-${i}`}
                                        className="flex items-center gap-1.5"
                                      >
                                        <input
                                          value={line.name}
                                          aria-label="название"
                                          onChange={(e) =>
                                            set_line_draft((prev) =>
                                              prev.map((row, idx) =>
                                                idx === i
                                                  ? { ...row, name: e.target.value }
                                                  : row
                                              )
                                            )
                                          }
                                          className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-highlight"
                                        />
                                        <input
                                          value={line.volume || ''}
                                          aria-label="объём"
                                          placeholder="мл"
                                          onChange={(e) =>
                                            set_line_draft((prev) =>
                                              prev.map((row, idx) =>
                                                idx === i
                                                  ? {
                                                      ...row,
                                                      volume: e.target.value.replace(
                                                        /[^\d]/g,
                                                        ''
                                                      ),
                                                    }
                                                  : row
                                              )
                                            )
                                          }
                                          className="w-14 rounded-lg border border-neutral-200 bg-white px-1.5 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                                        />
                                        <input
                                          value={line.quantity}
                                          inputMode="numeric"
                                          aria-label="количество"
                                          onChange={(e) =>
                                            set_line_draft((prev) =>
                                              prev.map((row, idx) =>
                                                idx === i
                                                  ? {
                                                      ...row,
                                                      quantity: e.target.value.replace(
                                                        /[^\d]/g,
                                                        ''
                                                      ),
                                                    }
                                                  : row
                                              )
                                            )
                                          }
                                          className="w-12 rounded-lg border border-neutral-200 bg-white px-1.5 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                                        />
                                        <input
                                          value={line.price}
                                          inputMode="numeric"
                                          aria-label="оплачено за штуку"
                                          title="оплачено ₽; меньше обычной цены = скидка"
                                          onChange={(e) =>
                                            set_line_draft((prev) =>
                                              prev.map((row, idx) =>
                                                idx === i
                                                  ? {
                                                      ...row,
                                                      price: e.target.value.replace(
                                                        /[^\d]/g,
                                                        ''
                                                      ),
                                                    }
                                                  : row
                                              )
                                            )
                                          }
                                          className="w-16 rounded-lg border border-neutral-200 bg-white px-1.5 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                                        />
                                        <button
                                          type="button"
                                          aria-label="убрать позицию"
                                          onClick={() =>
                                            set_line_draft((prev) =>
                                              prev.filter((_, idx) => idx !== i)
                                            )
                                          }
                                          className="px-1 text-sm text-neutral-400 hover:text-red-500"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <p className="text-sm font-bold tabular-nums text-neutral-900">
                                      итого оплачено {draft_total.toLocaleString('ru-RU')} ₽
                                    </p>
                                    <p className="text-[11px] text-neutral-400">
                                      объём и сумма пишутся в заказ · меньше цены = скидка · в историю правок
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        set_line_draft((prev) => [
                                          ...prev,
                                          {
                                            menu_id: '',
                                            name: '',
                                            quantity: '1',
                                            price: '0',
                                          },
                                        ])
                                      }
                                      className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
                                    >
                                      + позиция
                                    </button>
                                    <p className="text-xs text-neutral-400">
                                      бобаллы при правке не меняются
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={
                                          order_busy === o.id || line_draft.length === 0
                                        }
                                        onClick={() => void save_order(c, o)}
                                        className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                                      >
                                        {order_busy === o.id ? '…' : 'сохранить'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={order_busy === o.id}
                                        onClick={() => set_edit_id(null)}
                                        className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 disabled:opacity-40"
                                      >
                                        отмена
                                      </button>
                                      <button
                                        type="button"
                                        disabled={order_busy === o.id}
                                        onClick={() => void remove_order(c, o)}
                                        className="rounded-xl px-3 py-1.5 text-sm font-semibold text-red-500 disabled:opacity-40"
                                      >
                                        удалить покупку
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <ul className="divide-y divide-neutral-100">
                                      {o.items.map((item, i) => {
                                        const line_total = item.price * item.quantity;
                                        const normalized = normalize_order_item_fields({
                                          name: item.name,
                                          volume: item.volume,
                                        });
                                        const vol = normalized.volume
                                          ? /^\d+$/.test(normalized.volume)
                                            ? `${normalized.volume} мл`
                                            : normalized.volume
                                          : null;
                                        const drink = drink_for_line(item);
                                        return (
                                          <li
                                            key={`${o.id}-${i}`}
                                            className="flex items-center justify-between gap-2 py-1 first:pt-0 last:pb-0"
                                          >
                                            <div className="flex min-w-0 items-center gap-1.5">
                                              {createElement(purchase_drink_thumb, { item: drink })}
                                              <p className="min-w-0 text-[13px] font-bold leading-snug text-neutral-900">
                                                <span>{normalized.name}</span>
                                                {item.quantity > 1 ? (
                                                  <span className="ml-1 font-semibold text-neutral-500">
                                                    ×{item.quantity}
                                                  </span>
                                                ) : null}
                                                {vol ? (
                                                  <span className="ml-1 text-[11px] font-semibold text-neutral-500">
                                                    {vol}
                                                  </span>
                                                ) : null}
                                              </p>
                                            </div>
                                            <p className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-400">
                                              {line_total.toLocaleString('ru-RU')} ₽
                                            </p>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    <div className="mt-1 flex items-center justify-between gap-2 border-t border-neutral-100 pt-1">
                                      <p className="text-[11px] font-semibold text-neutral-500">итого</p>
                                      <p className="text-[13px] font-bold tabular-nums text-neutral-900">
                                        {o.total_price.toLocaleString('ru-RU')} ₽
                                      </p>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-1">
                                      <p className="text-[11px] text-neutral-500">
                                        {format_when(o.created_at)}
                                        <span className="mx-1 text-neutral-300">·</span>
                                        {status_label[o.status] || o.status}
                                        <span className="mx-1 text-neutral-300">·</span>
                                        {payment_label[o.payment_type] || o.payment_type}
                                      </p>
                                      <button
                                        type="button"
                                        disabled={order_busy === o.id}
                                        onClick={() => start_edit(o)}
                                        className="text-xs font-medium text-neutral-400 hover:text-neutral-700"
                                      >
                                        править
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const period_orders = active_orders(c.orders, analytics_period_state);
                      const drinks = drinks_count(period_orders);
                      const spent = spent_sum(period_orders);
                      const rate = drinks_per_week_rate(
                        drinks,
                        analytics_period_state,
                        period_orders
                      );
                      const tops = analytics_top_items(
                        period_orders,
                        (name, volume) =>
                          normalize_order_item_fields({ name, volume }).name
                      );
                      const activity_counts =
                        activity_tab === 'days'
                          ? by_weekday(period_orders)
                          : by_hour_bucket(period_orders);
                      const activity_labels =
                        activity_tab === 'days' ? WEEKDAY_LABELS : HOUR_BUCKET_LABELS;
                      const peak = peak_index(activity_counts);
                      const max_act = Math.max(1, ...activity_counts);
                      const period_chip = (id: analytics_period, label: string) => (
                        <button
                          key={id}
                          type="button"
                          data-stop-collapse
                          onClick={() => set_analytics_period(id)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                            analytics_period_state === id
                              ? 'bg-neutral-900 text-white'
                              : 'bg-white text-neutral-500 ring-1 ring-neutral-200 hover:text-neutral-800'
                          }`}
                        >
                          {label}
                        </button>
                      );
                      return (
                    <aside className="space-y-1.5" data-stop-collapse>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <h4 className="font-heading-soft text-xs font-bold uppercase tracking-wide text-neutral-700">
                          Аналитика
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {period_chip('week', 'неделя')}
                          {period_chip('month', 'месяц')}
                          {period_chip('all', 'всё')}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-lg border border-neutral-200/80 bg-white px-2 py-1.5">
                          <p className="text-[10px] font-medium text-neutral-500">заказов</p>
                          <p className="text-base font-bold tabular-nums text-neutral-900">
                            {period_orders.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-200/80 bg-white px-2 py-1.5">
                          <p className="text-[10px] font-medium text-neutral-500">сумма</p>
                          <p className="text-base font-bold tabular-nums text-neutral-900">
                            {spent.toLocaleString('ru-RU')} ₽
                          </p>
                        </div>
                        <div className="rounded-lg border border-neutral-200/80 bg-white px-2 py-1.5">
                          <p className="text-[10px] font-medium text-neutral-500">напитки</p>
                          <p className="text-base font-bold tabular-nums text-neutral-900">
                            {drinks}
                          </p>
                        </div>
                      </div>
                      {rate != null ? (
                        <p className="px-0.5 text-[10px] font-medium text-neutral-500">
                          ~{rate.toLocaleString('ru-RU')} нап./нед.
                        </p>
                      ) : null}
                      <section className="rounded-lg border border-neutral-200/80 bg-white px-2 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-heading-soft text-[11px] font-bold text-neutral-800">
                            Активность
                          </h5>
                          <div className="flex gap-0.5 rounded-full bg-neutral-100 p-0.5">
                            {(
                              [
                                ['days', 'дни'],
                                ['hours', 'время'],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => set_activity_tab(id)}
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                  activity_tab === id
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {period_orders.length === 0 ? (
                          <p className="mt-2 text-[11px] text-neutral-400">нет заказов за период</p>
                        ) : (
                          <div className="mt-2 flex h-[52px] items-end gap-0.5">
                            {activity_counts.map((n, i) => {
                              const h = n === 0 ? 3 : Math.max(8, Math.round((n / max_act) * 40));
                              const is_peak = n > 0 && i === peak;
                              const tip =
                                activity_tab === 'days'
                                  ? `${activity_labels[i]}: ${n} зак.`
                                  : `${i * 2}:00–${i * 2 + 2}:00: ${n} зак.`;
                              return (
                                <div
                                  key={`${activity_tab}-${i}`}
                                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
                                  title={tip}
                                >
                                  <div
                                    className={`w-full max-w-[14px] rounded-sm ${
                                      is_peak ? 'bg-accent' : 'bg-neutral-200'
                                    }`}
                                    style={{ height: `${h}px` }}
                                  />
                                  <span className="text-[8px] font-medium tabular-nums text-neutral-400">
                                    {activity_labels[i]}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                      {tops.length > 0 ? (
                        <section className="rounded-lg border border-neutral-200/80 bg-white px-2 py-2">
                          <h5 className="font-heading-soft text-[11px] font-bold text-neutral-800">
                            Часто берёт
                          </h5>
                          <ul className="mt-1.5 space-y-1">
                            {tops.map((item) => {
                              const drink = drink_for_line({
                                name: item.name,
                                menu_id: item.menu_id,
                              });
                              return (
                                <li
                                  key={`${item.menu_id || item.name}`}
                                  className="flex items-center justify-between gap-1.5"
                                >
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {createElement(purchase_drink_thumb, { item: drink })}
                                    <span className="truncate text-[11px] font-semibold text-neutral-800">
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-neutral-500">
                                    ×{item.quantity}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ) : (
                        <p className="rounded-lg border border-dashed border-neutral-200 bg-white/70 px-2 py-1.5 text-[11px] text-neutral-400">
                          любимых напитков пока нет
                        </p>
                      )}
                    </aside>
                      );
                    })()}
                  </div>
                </li>
              );
            }

            const last = last_order_of(c);
            return (
              <li
                key={c.id}
                className={`overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm transition-opacity ${
                  open_id ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => set_open_id(c.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span className="shrink-0">
                      {createElement(avatar_circle, {
                        emoji: c.avatar_emoji,
                        image_url: c.avatar_url,
                        user_id: c.id.startsWith('guest:') ? null : c.id,
                        size: 'sm',
                      })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-neutral-900">{c.name}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#0039A6] py-0.5 pl-0.5 pr-1.5 text-white">
                          {createElement(TapicoinIcon, {
                            size: 16,
                            className: '!ring-white/30',
                          })}
                          <span className="text-[11px] font-bold tabular-nums leading-none">
                            {c.bonus_balance}
                          </span>
                        </span>
                        {is_student_discount_active(c) ? (
                          <span className="inline-flex items-center rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            студент
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium text-neutral-700 tabular-nums">
                        {format_phone_display(c.phone)}
                      </span>
                      <span className="mt-1 block text-xs text-neutral-400">
                        {last
                          ? `последний ${format_when(last.created_at)} · ${last.total_price.toLocaleString('ru-RU')} ₽`
                          : 'пока без заказов'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => set_open_id(c.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    открыть
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AdminShell>
  );
}
