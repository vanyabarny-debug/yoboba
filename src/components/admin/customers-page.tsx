'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';
import avatar_circle from '@/components/avatar-circle';
import { format_phone_display } from '@/lib/phone';

type customer_order = {
  id: string;
  created_at: string;
  status: 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  total_price: number;
  payment_type: 'cash' | 'card' | 'online' | 'bonus';
  items: { name: string; quantity: number; price: number }[];
};

type customer_row = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  via: 'vk' | 'телефон' | 'vk и телефон';
  bonus_balance: number;
  created_at: string | null;
  avatar_emoji: string | null;
  avatar_url: string | null;
  vk_url: string | null;
  orders_count: number;
  spent: number;
  last_order_at: string | null;
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
  bonus: 'бобабаллами',
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
                <button
                  type="button"
                  onClick={() => set_open_id(open ? null : c.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
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
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {open ? 'свернуть' : 'покупки'}
                  </span>
                </button>

                {open && (
                  <div className="border-t border-neutral-100 px-4 py-3">
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
                        {c.orders.map((o) => (
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
                              <p className="shrink-0 text-sm font-semibold tabular-nums">
                                {o.total_price.toLocaleString('ru-RU')} ₽
                              </p>
                            </div>
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
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.bonus_balance > 0 && (
                      <p className="mt-3 text-xs text-neutral-400">
                        бобабаллы: {c.bonus_balance}
                      </p>
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
