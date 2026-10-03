'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import avatar_circle from '@/components/avatar-circle';
import { format_phone_display } from '@/lib/phone';

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
  const qty = new Map<string, number>();
  for (const o of active) {
    for (const item of o.items) {
      qty.set(item.name, (qty.get(item.name) || 0) + item.quantity);
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
    top_items: [...qty.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5),
  };
}

function orders_word(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заказ';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'заказа';
  return 'заказов';
}

export default function customers_page() {
  const [data, set_data] = useState<payload | null>(null);
  const [error, set_error] = useState('');
  const [query, set_query] = useState('');
  const [only_buyers, set_only_buyers] = useState(false);
  const [open_id, set_open_id] = useState<string | null>(null);
  const [student_busy, set_student_busy] = useState<string | null>(null);
  const [bonus_draft, set_bonus_draft] = useState<Record<string, string>>({});
  const [bonus_busy, set_bonus_busy] = useState<string | null>(null);
  const [edit_id, set_edit_id] = useState<string | null>(null);
  const [line_draft, set_line_draft] = useState<line_draft[]>([]);
  const [order_busy, set_order_busy] = useState<string | null>(null);

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
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        student_claimed?: boolean;
        student_verified?: boolean;
        student_verified_at?: string | null;
        student_verified_by?: string | null;
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
                    }
                  : row
              ),
            }
          : prev
      );
    } catch {
      set_error('не удалось обновить статус студента');
    } finally {
      set_student_busy(null);
    }
  }

  function start_edit(o: customer_order) {
    set_edit_id(o.id);
    set_line_draft(
      o.items.map((item) => ({
        menu_id: item.menu_id || '',
        name: item.name,
        quantity: String(item.quantity),
        price: String(item.price),
        volume: item.volume,
        kind: item.kind,
      }))
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
    const items = line_draft.map((line) => ({
      menu_id: line.menu_id,
      name: line.name.trim(),
      quantity: Number(line.quantity),
      price: Number(line.price),
      ...(line.volume ? { volume: line.volume } : {}),
      ...(line.kind ? { kind: line.kind } : {}),
    }));
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

        <ul className="space-y-2">
          {filtered.map((c) => {
            const open = open_id === c.id;
            return (
              <li
                key={c.id}
                className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => set_open_id(open ? null : c.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                  <span className="shrink-0">
                    {c.vk_url ? (
                      <a
                        href={c.vk_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="открыть в vk"
                        onClick={(e) => e.stopPropagation()}
                        className="block"
                      >
                        {createElement(avatar_circle, {
                          emoji: c.avatar_emoji,
                          image_url: c.avatar_url,
                          user_id: c.id.startsWith('guest:') ? null : c.id,
                          size: 'sm',
                        })}
                      </a>
                    ) : (
                      createElement(avatar_circle, {
                        emoji: c.avatar_emoji,
                        image_url: c.avatar_url,
                        user_id: c.id.startsWith('guest:') ? null : c.id,
                        size: 'sm',
                      })
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      {c.vk_url ? (
                        <a
                          href={c.vk_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-neutral-900 hover:text-accent hover:underline"
                        >
                          {c.name}
                        </a>
                      ) : (
                        <span className="font-semibold text-neutral-900">{c.name}</span>
                      )}
                      <span className="text-xs text-neutral-400">
                        {c.via}
                      </span>
                      {c.vk_url && (
                        <a
                          href={c.vk_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          открыть vk
                        </a>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-neutral-700 tabular-nums">
                      {format_phone_display(c.phone)}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      {c.orders_count
                        ? `${c.orders_count} ${orders_word(c.orders_count)} · ${c.spent.toLocaleString('ru-RU')} ₽`
                        : 'пока без заказов'}
                      {c.top_items[0] ? ` · часто: ${c.top_items[0].name}` : ''}
                      {c.student_verified
                        ? ' · студент −30%'
                        : c.student_claimed
                          ? ' · ждёт подтверждения студента'
                          : ''}
                    </span>
                  </span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                    {c.has_profile ? (
                      <>
                        <label className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`бобаллы ${c.name}`}
                            value={bonus_value(c)}
                            disabled={bonus_busy === c.id}
                            onChange={(e) =>
                              set_bonus_draft((prev) => ({
                                ...prev,
                                [c.id]: e.target.value.replace(/[^\d]/g, ''),
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void save_bonus(c);
                              }
                            }}
                            className="w-16 rounded-lg border border-neutral-200 bg-page px-2 py-1 text-right text-sm font-bold tabular-nums text-neutral-900 outline-none focus:ring-2 focus:ring-highlight disabled:opacity-50"
                          />
                          <span className="text-xs font-semibold text-neutral-500">бб</span>
                        </label>
                        {bonus_value(c) !== String(c.bonus_balance) && (
                          <button
                            type="button"
                            disabled={bonus_busy === c.id}
                            onClick={() => void save_bonus(c)}
                            className="rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                          >
                            {bonus_busy === c.id ? '…' : 'сохранить'}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-bold tabular-nums text-neutral-400">
                        {c.bonus_balance} бб
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => set_open_id(open ? null : c.id)}
                      className="text-xs text-neutral-400"
                    >
                      {open ? 'свернуть' : 'покупки'}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-neutral-100 px-4 py-3 space-y-3">
                    <div className="rounded-xl bg-page px-3 py-2.5">
                      <p className="text-sm font-medium text-neutral-900">студенческая скидка</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {c.student_verified
                          ? `подтверждена${c.student_verified_by ? ` · ${c.student_verified_by}` : ''}`
                          : c.student_claimed
                            ? 'гость отметил «я студент» — подтвердите, чтобы включить −30%'
                            : 'гость не отмечал статус студента'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!c.student_verified ? (
                          <button
                            type="button"
                            disabled={student_busy === c.id}
                            onClick={() => void set_student(c, true)}
                            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            {student_busy === c.id ? '…' : 'подтвердить студента'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={student_busy === c.id}
                            onClick={() => void set_student(c, false)}
                            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-40"
                          >
                            {student_busy === c.id ? '…' : 'снять подтверждение'}
                          </button>
                        )}
                      </div>
                    </div>
                    {c.top_items.length > 0 && (
                      <p className="mb-3 text-xs text-neutral-500">
                        брал:{' '}
                        {c.top_items
                          .map((item) => `${item.name} ×${item.quantity}`)
                          .join(' · ')}
                      </p>
                    )}
                    {c.orders.length === 0 ? (
                      <p className="text-sm text-neutral-400">заказов ещё не было</p>
                    ) : (
                      <ul className="space-y-3">
                        {c.orders.map((o) => {
                          const editing = edit_id === o.id;
                          const draft_total = line_draft.reduce(
                            (sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 0),
                            0
                          );
                          return (
                            <li key={o.id} className="rounded-xl bg-page px-3 py-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-neutral-900">
                                    {format_when(o.created_at)}
                                  </p>
                                  <p className="text-xs text-neutral-500">
                                    {status_label[o.status] || o.status} ·{' '}
                                    {payment_label[o.payment_type] || o.payment_type}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <p className="text-sm font-semibold tabular-nums">
                                    {(editing ? draft_total : o.total_price).toLocaleString('ru-RU')} ₽
                                  </p>
                                  {!editing ? (
                                    <button
                                      type="button"
                                      disabled={order_busy === o.id}
                                      onClick={() => start_edit(o)}
                                      className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                                    >
                                      править
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              {editing ? (
                                <div className="mt-2 space-y-2">
                                  {line_draft.map((line, i) => (
                                    <div key={`${o.id}-${i}`} className="flex items-center gap-1.5">
                                      <input
                                        value={line.name}
                                        aria-label="название"
                                        onChange={(e) =>
                                          set_line_draft((prev) =>
                                            prev.map((row, idx) =>
                                              idx === i ? { ...row, name: e.target.value } : row
                                            )
                                          )
                                        }
                                        className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-highlight"
                                      />
                                      <input
                                        value={line.quantity}
                                        inputMode="numeric"
                                        aria-label="количество"
                                        onChange={(e) =>
                                          set_line_draft((prev) =>
                                            prev.map((row, idx) =>
                                              idx === i
                                                ? { ...row, quantity: e.target.value.replace(/[^\d]/g, '') }
                                                : row
                                            )
                                          )
                                        }
                                        className="w-12 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                                      />
                                      <input
                                        value={line.price}
                                        inputMode="numeric"
                                        aria-label="цена"
                                        onChange={(e) =>
                                          set_line_draft((prev) =>
                                            prev.map((row, idx) =>
                                              idx === i
                                                ? { ...row, price: e.target.value.replace(/[^\d]/g, '') }
                                                : row
                                            )
                                          )
                                        }
                                        className="w-16 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-highlight"
                                      />
                                      <button
                                        type="button"
                                        aria-label="убрать позицию"
                                        onClick={() =>
                                          set_line_draft((prev) => prev.filter((_, idx) => idx !== i))
                                        }
                                        className="px-1 text-sm text-neutral-400 hover:text-red-500"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      set_line_draft((prev) => [
                                        ...prev,
                                        { menu_id: '', name: '', quantity: '1', price: '0' },
                                      ])
                                    }
                                    className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
                                  >
                                    + позиция
                                  </button>
                                  <p className="text-[11px] text-neutral-400">
                                    бобаллы при правке не меняются
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={order_busy === o.id || line_draft.length === 0}
                                      onClick={() => void save_order(c, o)}
                                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                    >
                                      {order_busy === o.id ? '…' : 'сохранить'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={order_busy === o.id}
                                      onClick={() => set_edit_id(null)}
                                      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-40"
                                    >
                                      отмена
                                    </button>
                                    <button
                                      type="button"
                                      disabled={order_busy === o.id}
                                      onClick={() => void remove_order(c, o)}
                                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 disabled:opacity-40"
                                    >
                                      удалить покупку
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ul className="mt-2 space-y-0.5 text-sm text-neutral-700">
                                  {o.items.map((item, i) => (
                                    <li key={`${o.id}-${i}`} className="flex justify-between gap-3">
                                      <span>{item.name}</span>
                                      <span className="shrink-0 tabular-nums text-neutral-500">
                                        ×{item.quantity}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AdminShell>
  );
}
