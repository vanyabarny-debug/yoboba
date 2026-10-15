'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/admin-shell';
import { use_admin_spot } from '@/components/admin/admin-spot-context';
import type { ledger_entry, ledger_kind } from '@/lib/admin-operations-server';

type feed = {
  entries?: ledger_entry[];
  cash?: number;
  card?: number;
  balance?: number;
  anchor?: { at: string; cash: number; card: number } | null;
  error?: string;
};

type sort_id = 'new' | 'old' | 'sum_desc' | 'sum_asc';
type channel_filter = 'all' | 'cash' | 'card';

const kind_label: Record<ledger_kind, string> = {
  sale: 'продажа',
  purchase: 'закупка',
  expense: 'расход',
  collection: 'инкассация',
  financing: 'финансирование',
  fixed: 'постоянный расход',
};

const kind_order: ledger_kind[] = [
  'sale',
  'purchase',
  'expense',
  'collection',
  'financing',
  'fixed',
];

const month_gen = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function rub(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function ymd_moscow(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function shift_ymd(ymd: string, days: number) {
  const t = new Date(`${ymd}T12:00:00+03:00`).getTime() + days * 86_400_000;
  return ymd_moscow(new Date(t).toISOString());
}

function day_heading(ymd: string, today: string) {
  if (!ymd) return '';
  if (ymd === today) return 'сегодня';
  if (ymd === shift_ymd(today, -1)) return 'вчера';
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return `${day} ${month_gen[month - 1] || ''}`.trim();
}

function clock(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function amount_text(entry: ledger_entry) {
  const n = rub(entry.amount);
  if (entry.direction === 'move' || entry.amount === 0) return n;
  return entry.direction === 'in' ? `+${n}` : `−${n}`;
}

function amount_class(entry: ledger_entry) {
  if (entry.amount === 0) return 'text-neutral-400';
  if (entry.direction === 'move' || entry.kind === 'collection') return 'text-amber-600';
  if (entry.direction === 'in') return 'text-emerald-600';
  return 'text-red-500';
}

function icon_wrap(kind: ledger_kind) {
  if (kind === 'collection') return 'bg-amber-50 text-amber-600';
  if (kind === 'sale' || kind === 'financing') return 'bg-emerald-50 text-emerald-700';
  return 'bg-red-50 text-red-600';
}

function KindIcon({ kind }: { kind: ledger_kind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true as const,
  };
  if (kind === 'sale') {
    return (
      <svg {...common}>
        <path d="M8 9h7v4.5a3.5 3.5 0 0 1-7 0V9Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15 10h1.6a1.8 1.8 0 0 1 0 3.6H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9 20.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'purchase') {
    return (
      <svg {...common}>
        <path d="M4 8.5 12 4.5l8 4-8 4-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M4 8.5V16l8 4 8-4V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 12.5V20" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === 'expense') {
    return (
      <svg {...common}>
        <path d="M12 4v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 12.5 12 17.5 17 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 20h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'collection') {
    return (
      <svg {...common}>
        <path d="M4 10 12 5l8 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6 10v8M10 10v8M14 10v8M18 10v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'financing') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M16.5 7.5A6 6 0 1 0 18 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 5v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12h3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function operations_page() {
  return (
    <AdminShell>
      <OperationsBody />
    </AdminShell>
  );
}

function OperationsBody() {
  const { spot_id, spot_options } = use_admin_spot();
  const [entries, set_entries] = useState<ledger_entry[]>([]);
  const [cash, set_cash] = useState(0);
  const [card, set_card] = useState(0);
  const [balance, set_balance] = useState(0);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState('');
  const [open_id, set_open_id] = useState<string | null>(null);
  const [panel, set_panel] = useState<'filter' | 'sort' | null>(null);
  const [kinds, set_kinds] = useState<ledger_kind[]>([]);
  const [channel, set_channel] = useState<channel_filter>('all');
  const [q, set_q] = useState('');
  const [from, set_from] = useState('');
  const [to, set_to] = useState('');
  const [sort, set_sort] = useState<sort_id>('new');
  const [anchor_at, set_anchor_at] = useState<string | null>(null);
  const [fact_cash, set_fact_cash] = useState('');
  const [fact_card, set_fact_card] = useState('');
  const [fact_busy, set_fact_busy] = useState(false);
  const today = ymd_moscow(new Date().toISOString());
  const spot_label = useMemo(() => {
    const map = new Map(spot_options.map((s) => [s.id, s.label]));
    return (id: string | null) => (id ? map.get(id) || '' : '');
  }, [spot_options]);

  const reload = useCallback(async () => {
    set_loading(true);
    set_error('');
    const qs = new URLSearchParams({ feed: '1' });
    if (spot_id) qs.set('spot_id', spot_id);
    try {
      const res = await fetch(`/api/admin/operations?${qs}`, { credentials: 'same-origin' });
      const body = (await res.json()) as feed;
      if (body.error) {
        set_error(body.error);
        set_entries([]);
        return;
      }
      set_entries(body.entries || []);
      set_cash(body.cash || 0);
      set_card(body.card || 0);
      set_balance(body.balance || 0);
      set_anchor_at(body.anchor?.at || null);
      set_fact_cash(String(Math.round(body.cash || 0)));
      set_fact_card(String(Math.round(body.card || 0)));
    } catch {
      set_error('не удалось загрузить операции');
    } finally {
      set_loading(false);
    }
  }, [spot_id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    const from_t = from ? new Date(`${from}T00:00:00+03:00`).getTime() : null;
    const to_t = to ? new Date(`${to}T23:59:59.999+03:00`).getTime() : null;
    const kind_set = new Set(kinds);
    const next = entries.filter((entry) => {
      if (kind_set.size && !kind_set.has(entry.kind)) return false;
      if (channel === 'cash' && entry.kind !== 'collection' && entry.channel !== 'cash') return false;
      if (channel === 'card' && entry.kind !== 'collection' && entry.channel !== 'card') return false;
      const t = new Date(entry.at).getTime();
      if (from_t != null && t < from_t) return false;
      if (to_t != null && t > to_t) return false;
      if (query) {
        const hay = [kind_label[entry.kind], entry.title, ...entry.lines.flatMap((l) => [l.k, l.v])]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    next.sort((a, b) => {
      if (sort === 'old') return new Date(a.at).getTime() - new Date(b.at).getTime();
      if (sort === 'sum_desc') return b.amount - a.amount;
      if (sort === 'sum_asc') return a.amount - b.amount;
      return new Date(b.at).getTime() - new Date(a.at).getTime();
    });
    return next;
  }, [entries, kinds, channel, q, from, to, sort]);

  const grouped = useMemo(() => {
    if (sort !== 'new' && sort !== 'old') return [{ day: '', items: visible }];
    const groups: { day: string; items: ledger_entry[] }[] = [];
    for (const entry of visible) {
      const day = ymd_moscow(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(entry);
      else groups.push({ day, items: [entry] });
    }
    return groups;
  }, [visible, sort]);

  function toggle_kind(kind: ledger_kind) {
    set_kinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  }

  async function save_fact() {
    set_fact_busy(true);
    set_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          anchor: { cash: Number(fact_cash) || 0, card: Number(fact_card) || 0 },
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось записать факт');
        return;
      }
      await reload();
    } catch {
      set_error('не удалось записать факт');
    } finally {
      set_fact_busy(false);
    }
  }

  function customer_href(entry: ledger_entry) {
    if (entry.user_id) return `/admin/customers?customer=${encodeURIComponent(entry.user_id)}`;
    if (entry.customer_phone) return `/admin/customers?phone=${encodeURIComponent(entry.customer_phone)}`;
    return null;
  }

  const filters_on = kinds.length > 0 || channel !== 'all' || Boolean(q || from || to);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-1">
        <div />
        <div className="text-center">
          <p
            className={`font-heading-soft text-4xl font-bold tabular-nums tracking-tight sm:text-5xl ${
              balance < 0 ? 'text-red-500' : 'text-neutral-900'
            }`}
          >
            {loading ? '—' : rub(balance)}
          </p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
            баланс
          </p>
        </div>
        <dl className="justify-self-end space-y-2 text-right">
          <div>
            <dt className="text-[11px] text-neutral-400">нал</dt>
            <dd className={`text-sm font-semibold tabular-nums ${cash < 0 ? 'text-red-500' : 'text-neutral-900'}`}>
              {loading ? '—' : rub(cash)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutral-400">безнал</dt>
            <dd className={`text-sm font-semibold tabular-nums ${card < 0 ? 'text-red-500' : 'text-neutral-900'}`}>
              {loading ? '—' : rub(card)}
            </dd>
          </div>
        </dl>
      </header>
      {anchor_at ? (
        <p className="-mt-2 text-center text-[11px] text-neutral-400">
          от факта · {day_heading(ymd_moscow(anchor_at), today)} {clock(anchor_at)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Chip
          active={panel === 'filter' || filters_on}
          onClick={() => set_panel((p) => (p === 'filter' ? null : 'filter'))}
        >
          фильтрация
        </Chip>
        <Chip active={panel === 'sort'} onClick={() => set_panel((p) => (p === 'sort' ? null : 'sort'))}>
          сортировка
        </Chip>
      </div>

      {panel === 'filter' ? (
        <section className="space-y-3 rounded-2xl border border-neutral-200/80 bg-white p-3">
          <input
            value={q}
            onChange={(e) => set_q(e.target.value)}
            placeholder="поиск"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-highlight"
          />
          <div className="flex flex-wrap gap-1.5">
            {kind_order.map((kind) => {
              const on = kinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggle_kind(kind)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {kind_label[kind]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'все'],
                ['cash', 'нал'],
                ['card', 'безнал'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => set_channel(id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  channel === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => set_from(e.target.value)}
              aria-label="с даты"
              className="rounded-xl border border-neutral-200 px-2 py-2 text-sm"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => set_to(e.target.value)}
              aria-label="по дату"
              className="rounded-xl border border-neutral-200 px-2 py-2 text-sm"
            />
          </div>
          <div className="space-y-2 border-t border-neutral-100 pt-3">
            <p className="text-xs font-medium text-neutral-700">факт в кассе</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-neutral-500">
                нал
                <input
                  inputMode="numeric"
                  value={fact_cash}
                  onChange={(e) => set_fact_cash(e.target.value.replace(/[^\d-]/g, ''))}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-[11px] text-neutral-500">
                безнал
                <input
                  inputMode="numeric"
                  value={fact_card}
                  onChange={(e) => set_fact_card(e.target.value.replace(/[^\d-]/g, ''))}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm tabular-nums"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={fact_busy}
              onClick={() => void save_fact()}
              className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {fact_busy ? 'пишу…' : 'зафиксировать'}
            </button>
            <p className="text-[11px] leading-snug text-neutral-400">
              дальше баланс считается от этих сумм. старые отметки нал/безнал в него не входят.
            </p>
          </div>
          {filters_on ? (
            <button
              type="button"
              onClick={() => {
                set_kinds([]);
                set_channel('all');
                set_q('');
                set_from('');
                set_to('');
              }}
              className="text-xs font-medium text-neutral-500"
            >
              сбросить
            </button>
          ) : null}
        </section>
      ) : null}

      {panel === 'sort' ? (
        <section className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
          {(
            [
              ['new', 'сначала новые'],
              ['old', 'сначала старые'],
              ['sum_desc', 'сумма по убыванию'],
              ['sum_asc', 'сумма по возрастанию'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                set_sort(id);
                set_panel(null);
              }}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
            >
              {label}
              {sort === id ? <span className="text-emerald-600">✓</span> : null}
            </button>
          ))}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {loading ? <p className="py-10 text-center text-sm text-neutral-400">загрузка…</p> : null}
      {!loading && visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">нет операций</p>
      ) : null}

      <div className="space-y-5">
        {grouped.map((group) => (
          <section key={group.day || 'flat'} className="space-y-2">
            {group.day ? (
              <h2 className="px-1 text-xs font-medium text-neutral-400">{day_heading(group.day, today)}</h2>
            ) : null}
            <ul className="space-y-2">
              {group.items.map((entry) => {
                const open = open_id === entry.id;
                const href = customer_href(entry);
                const spot = spot_label(entry.spot_id);
                return (
                  <li key={entry.id}>
                    <article
                      className={`rounded-2xl bg-white px-3 py-3 ${
                        open
                          ? 'shadow-[0_8px_24px_rgba(20,16,12,0.06)] ring-1 ring-neutral-200'
                          : 'ring-1 ring-neutral-200/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => set_open_id(open ? null : entry.id)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${icon_wrap(entry.kind)}`}
                        >
                          <KindIcon kind={entry.kind} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-neutral-900">
                            {kind_label[entry.kind]}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-neutral-500">
                            {entry.title}
                            <span className="text-neutral-300"> · </span>
                            {clock(entry.at)}
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${amount_class(entry)}`}>
                          {amount_text(entry)}
                        </span>
                      </button>
                      {open ? (
                        <div className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3">
                          {entry.lines.map((line) =>
                            line.k === 'клиент' && href ? (
                              <div
                                key={`${entry.id}-customer`}
                                className="flex items-baseline justify-between gap-3 text-sm"
                              >
                                <span className="text-neutral-500">клиент</span>
                                <Link href={href} className="font-medium text-accent">
                                  {line.v}
                                </Link>
                              </div>
                            ) : (
                              <Detail key={`${entry.id}-${line.k}-${line.v}`} k={line.k} v={line.v} />
                            )
                          )}
                          {spot ? <Detail k="точка" v={spot} /> : null}
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 ring-1 ring-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 text-neutral-500">{k}</span>
      <span className="shrink-0 text-right tabular-nums text-neutral-900">{v}</span>
    </div>
  );
}
