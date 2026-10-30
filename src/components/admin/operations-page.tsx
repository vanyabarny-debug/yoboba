'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/admin-shell';
import { use_admin_spot } from '@/components/admin/admin-spot-context';
import type { ledger_entry, ledger_kind } from '@/lib/admin-operations-server';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import type { order_item } from '@/lib/types';

type feed = {
  entries?: ledger_entry[];
  cash?: number;
  card?: number;
  balance?: number;
  anchor?: { at: string; cash: number; card: number } | null;
  opex?: { id: string; name: string }[];
  error?: string;
};

type manual_kind = Exclude<ledger_kind, 'sale'>;

type draft = {
  id: string | null;
  kind: manual_kind;
  amount: string;
  title: string;
  day: string;
  time: string;
  channel: 'cash' | 'card';
  category_id: string;
  stock_linked: boolean;
};

type sale_line = {
  menu_id: string;
  name: string;
  quantity: string;
  price: string;
  volume?: string;
  temp?: order_item['temp'];
  kind?: order_item['kind'];
  combo_picks?: string[];
  combo_components?: order_item['combo_components'];
};

type sale_draft = {
  order_id: string;
  lines: sale_line[];
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

const manual_order: manual_kind[] = ['expense', 'purchase', 'collection', 'financing', 'fixed'];

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

function moscow_parts(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const when = Number.isFinite(d.getTime()) ? d : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

function when_label(iso: string, today: string) {
  const parts = moscow_parts(iso);
  return `${day_heading(parts.day, today)} ${parts.time}`.trim();
}

function amount_text(entry: ledger_entry) {
  const n = rub(entry.amount);
  if (entry.direction === 'move' || entry.amount === 0) return n;
  return entry.direction === 'in' ? `+${n}` : `−${n}`;
}

function signed_amount(entry: ledger_entry) {
  if (entry.direction === 'move' || entry.kind === 'collection' || entry.amount === 0) return 0;
  return entry.direction === 'out' ? -entry.amount : entry.amount;
}

function day_sum(items: ledger_entry[]) {
  return items.reduce((sum, entry) => sum + signed_amount(entry), 0);
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

function DayTotal({
  day,
  today,
  items,
}: {
  day: string;
  today: string;
  items: ledger_entry[];
}) {
  const sum = day_sum(items);
  const tone = sum > 0 ? 'text-emerald-600' : sum < 0 ? 'text-red-500' : 'text-neutral-400';
  const sign = sum > 0 ? '+' : sum < 0 ? '−' : '';
  return (
    <h2 className="flex min-w-0 items-baseline gap-2 text-xs font-medium">
      <span className="text-neutral-400">{day_heading(day, today)}</span>
      <span className={`tabular-nums ${tone}`}>
        {sign}
        {rub(Math.abs(sum))}
      </span>
    </h2>
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
  const [opex, set_opex] = useState<{ id: string; name: string }[]>([]);
  const [draft, set_draft] = useState<draft | null>(null);
  const [sale, set_sale] = useState<sale_draft | null>(null);
  const [form_error, set_form_error] = useState('');
  const [form_busy, set_form_busy] = useState(false);
  const [pay_busy, set_pay_busy] = useState<string | null>(null);
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
      set_opex(body.opex || []);
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

  function open_add(day?: string) {
    const now = moscow_parts();
    set_sale(null);
    set_form_error('');
    set_panel(null);
    set_draft({
      id: null,
      kind: 'expense',
      amount: '',
      title: '',
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : now.day,
      time: now.time,
      channel: 'cash',
      category_id: opex[0]?.id || '',
      stock_linked: false,
    });
  }

  function open_sale(entry: ledger_entry) {
    if (!entry.order_id) return;
    set_draft(null);
    set_form_error('');
    set_panel(null);
    set_open_id(entry.id);
    set_sale({
      order_id: entry.order_id,
      lines: (entry.items || []).map((item) => {
        const normalized = normalize_order_item_fields({ name: item.name, volume: item.volume });
        return {
          menu_id: item.menu_id || '',
          name: normalized.name,
          quantity: String(item.quantity),
          price: String(item.price),
          ...(normalized.volume ? { volume: normalized.volume } : {}),
          ...(item.temp ? { temp: item.temp } : {}),
          ...(item.kind ? { kind: item.kind } : {}),
          ...(item.combo_picks?.length ? { combo_picks: item.combo_picks } : {}),
          ...(item.combo_components?.length ? { combo_components: item.combo_components } : {}),
        };
      }),
    });
  }

  function open_edit(entry: ledger_entry) {
    if (!entry.id.startsWith('tx:') || entry.kind === 'sale') return;
    set_sale(null);
    const parts = moscow_parts(entry.at);
    set_form_error('');
    set_panel(null);
    set_draft({
      id: entry.id.slice(3),
      kind: entry.kind,
      amount: String(entry.amount),
      title: entry.title,
      day: parts.day,
      time: parts.time,
      channel: entry.kind === 'collection' ? 'cash' : entry.channel === 'card' ? 'card' : 'cash',
      category_id: entry.category_id || opex[0]?.id || '',
      stock_linked: entry.stock_linked,
    });
  }

  async function save_draft() {
    if (!draft || form_busy) return;
    set_form_busy(true);
    set_form_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: draft.id ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ledger: {
            ...(draft.id ? { id: draft.id } : { spot_id: spot_id || '' }),
            kind: draft.kind,
            amount: Number(draft.amount.replace(/\s/g, '')),
            title: draft.title.trim(),
            at: `${draft.day}T${(draft.time || '12:00').slice(0, 5)}:00+03:00`,
            channel: draft.channel,
            category_id: draft.category_id,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_form_error(body.error || 'не удалось записать');
        return;
      }
      set_draft(null);
      await reload();
    } catch {
      set_form_error('не удалось записать');
    } finally {
      set_form_busy(false);
    }
  }

  async function remove_draft() {
    if (!draft?.id || draft.stock_linked || form_busy) return;
    if (!window.confirm('удалить операцию?')) return;
    set_form_busy(true);
    set_form_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ledger: { id: draft.id, remove: true } }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_form_error(body.error || 'не удалось удалить');
        return;
      }
      set_draft(null);
      await reload();
    } catch {
      set_form_error('не удалось удалить');
    } finally {
      set_form_busy(false);
    }
  }

  async function save_sale() {
    if (!sale || form_busy) return;
    const items = sale.lines
      .map((line) => {
        const normalized = normalize_order_item_fields({ name: line.name.trim(), volume: line.volume });
        return {
          menu_id: line.menu_id,
          name: normalized.name,
          quantity: Math.round(Number(line.quantity)),
          price: Math.round(Number(String(line.price).replace(/\s/g, ''))),
          ...(normalized.volume ? { volume: normalized.volume } : {}),
          ...(line.temp ? { temp: line.temp } : {}),
          ...(line.kind ? { kind: line.kind } : {}),
          ...(line.combo_picks?.length ? { combo_picks: line.combo_picks } : {}),
          ...(line.combo_components?.length ? { combo_components: line.combo_components } : {}),
        };
      })
      .filter((line) => line.name);
    if (!items.length) {
      set_form_error('оставьте хотя бы одну позицию или удалите продажу');
      return;
    }
    set_form_busy(true);
    set_form_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sale.order_id, items }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_form_error(body.error || 'не удалось записать');
        return;
      }
      set_sale(null);
      await reload();
    } catch {
      set_form_error('не удалось записать');
    } finally {
      set_form_busy(false);
    }
  }

  async function remove_sale() {
    if (!sale || form_busy) return;
    if (!window.confirm('удалить эту продажу?')) return;
    set_form_busy(true);
    set_form_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: sale.order_id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_form_error(body.error || 'не удалось удалить');
        return;
      }
      set_sale(null);
      set_open_id(null);
      await reload();
    } catch {
      set_form_error('не удалось удалить');
    } finally {
      set_form_busy(false);
    }
  }

  async function save_payment(order_id: string, payment: 'cash' | 'card') {
    if (pay_busy) return;
    set_pay_busy(order_id);
    set_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: order_id, payment_type: payment }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось сменить оплату');
        return;
      }
      await reload();
    } catch {
      set_error('не удалось сменить оплату');
    } finally {
      set_pay_busy(null);
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
        <Chip active={Boolean(draft)} onClick={() => (draft ? set_draft(null) : open_add())}>
          {draft?.id ? 'правка' : 'добавить'}
        </Chip>
      </div>

      {draft ? (
        <OperationForm
          draft={draft}
          opex={opex}
          busy={form_busy}
          error={form_error}
          on_change={set_draft}
          on_save={() => void save_draft()}
          on_remove={draft.id && !draft.stock_linked ? () => void remove_draft() : null}
          on_close={() => set_draft(null)}
        />
      ) : null}

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
              <div className="flex items-center justify-between gap-3 px-1">
                <DayTotal day={group.day} today={today} items={group.items} />
                <button
                  type="button"
                  aria-label="добавить"
                  onClick={() => open_add(group.day)}
                  className="grid h-7 w-7 shrink-0 place-items-center text-lg font-semibold leading-none text-neutral-500"
                >
                  +
                </button>
              </div>
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
                        onClick={() => {
                          if (open) {
                            set_open_id(null);
                            if (sale?.order_id === entry.order_id) set_sale(null);
                          } else {
                            set_open_id(entry.id);
                          }
                        }}
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
                            {entry.actor_name ? (
                              <>
                                <span className="text-neutral-300"> · </span>
                                {entry.actor_name}
                              </>
                            ) : null}
                            {entry.changes.length ? (
                              <>
                                <span className="text-neutral-300"> · </span>
                                правки
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${amount_class(entry)}`}>
                          {amount_text(entry)}
                        </span>
                      </button>
                      {open ? (
                        <div className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3">
                          {sale?.order_id === entry.order_id ? (
                            <SaleForm
                              sale={sale}
                              busy={form_busy}
                              error={form_error}
                              on_change={set_sale}
                              on_save={() => void save_sale()}
                              on_remove={() => void remove_sale()}
                              on_close={() => {
                                set_sale(null);
                                set_form_error('');
                              }}
                            />
                          ) : (
                            entry.lines.map((line) =>
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
                            )
                          )}
                          {spot ? <Detail k="точка" v={spot} /> : null}
                          {entry.actor_name ? (
                            <Detail
                              k="записал"
                              v={
                                entry.recorded_at
                                  ? `${entry.actor_name} · ${when_label(entry.recorded_at, today)}`
                                  : entry.actor_name
                              }
                            />
                          ) : null}
                          {entry.changes.length ? (
                            <div className="space-y-1 pt-1">
                              <p className="text-xs text-neutral-400">правки</p>
                              {entry.changes.map((change) => (
                                <p
                                  key={`${entry.id}-${change.at}-${change.text}`}
                                  className="text-xs leading-snug text-neutral-600"
                                >
                                  <span className="text-neutral-400">{when_label(change.at, today)}</span>{' '}
                                  <span className="font-medium text-neutral-800">{change.actor_name}</span>
                                  {' — '}
                                  {change.text}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          {entry.id.startsWith('tx:') ? (
                            <button
                              type="button"
                              onClick={() => open_edit(entry)}
                              className="pt-1 text-xs font-semibold text-neutral-700"
                            >
                              изменить
                            </button>
                          ) : null}
                          {entry.order_id && sale?.order_id !== entry.order_id ? (
                            <button
                              type="button"
                              onClick={() => open_sale(entry)}
                              className="pt-1 text-xs font-semibold text-neutral-700"
                            >
                              изменить
                            </button>
                          ) : null}
                          {entry.order_id && (entry.payment === 'cash' || entry.payment === 'card') ? (
                            <div className="flex gap-1.5 pt-1">
                              {(
                                [
                                  ['cash', 'нал'],
                                  ['card', 'безнал'],
                                ] as const
                              ).map(([id, label]) => (
                                <button
                                  key={id}
                                  type="button"
                                  disabled={pay_busy === entry.order_id}
                                  onClick={() => {
                                    if (entry.payment !== id && entry.order_id) void save_payment(entry.order_id, id);
                                  }}
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    entry.payment === id
                                      ? 'bg-neutral-900 text-white'
                                      : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : null}
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

function OperationForm({
  draft,
  opex,
  busy,
  error,
  on_change,
  on_save,
  on_remove,
  on_close,
}: {
  draft: draft;
  opex: { id: string; name: string }[];
  busy: boolean;
  error: string;
  on_change: (next: draft) => void;
  on_save: () => void;
  on_remove: (() => void) | null;
  on_close: () => void;
}) {
  const kinds = opex.length ? manual_order : manual_order.filter((kind) => kind !== 'fixed');
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200/80 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">{draft.id ? 'изменить операцию' : 'новая операция'}</p>
        <button type="button" onClick={on_close} className="text-xs font-medium text-neutral-500">
          закрыть
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((kind) => {
          const locked = draft.stock_linked && kind !== 'purchase';
          return (
            <button
              key={kind}
              type="button"
              disabled={locked}
              onClick={() => on_change({ ...draft, kind })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-30 ${
                draft.kind === kind ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {kind_label[kind]}
            </button>
          );
        })}
      </div>
      {draft.kind === 'fixed' ? (
        <label className="block text-[11px] text-neutral-500">
          статья
          <select
            value={draft.category_id}
            onChange={(e) => on_change({ ...draft, category_id: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm text-neutral-900"
          >
            {opex.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-[11px] text-neutral-500">
        что это
        <input
          value={draft.title}
          onChange={(e) => on_change({ ...draft, title: e.target.value })}
          placeholder="чай, аренда, инкассация"
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
        />
      </label>
      <label className="block text-[11px] text-neutral-500">
        сумма, ₽
        <input
          inputMode="numeric"
          value={draft.amount}
          onChange={(e) => on_change({ ...draft, amount: e.target.value.replace(/[^\d]/g, '') })}
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-neutral-500">
          день
          <input
            type="date"
            value={draft.day}
            onChange={(e) => on_change({ ...draft, day: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="text-[11px] text-neutral-500">
          время
          <input
            type="time"
            value={draft.time}
            onChange={(e) => on_change({ ...draft, time: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm"
          />
        </label>
      </div>
      {draft.kind !== 'collection' ? (
        <div className="flex gap-1.5">
          {(
            [
              ['cash', 'нал'],
              ['card', 'безнал'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => on_change({ ...draft, channel: id })}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                draft.channel === id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {draft.stock_linked ? (
        <p className="text-[11px] leading-snug text-neutral-400">
          закупка уже на складе: тип не меняется, сумма обновит накладную
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={on_save}
          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'пишу…' : 'сохранить'}
        </button>
        {on_remove ? (
          <button type="button" disabled={busy} onClick={on_remove} className="text-xs font-medium text-red-500">
            удалить
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SaleForm({
  sale,
  busy,
  error,
  on_change,
  on_save,
  on_remove,
  on_close,
}: {
  sale: sale_draft;
  busy: boolean;
  error: string;
  on_change: (next: sale_draft) => void;
  on_save: () => void;
  on_remove: () => void;
  on_close: () => void;
}) {
  const total = sale.lines.reduce(
    (sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 0),
    0
  );
  function patch(i: number, next: Partial<sale_line>) {
    on_change({
      ...sale,
      lines: sale.lines.map((line, idx) => (idx === i ? { ...line, ...next } : line)),
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">изменить продажу</p>
        <button type="button" onClick={on_close} className="text-xs font-medium text-neutral-500">
          закрыть
        </button>
      </div>
      {sale.lines.map((line, i) => (
        <div key={`${sale.order_id}-${i}`} className="grid grid-cols-[1fr_3.2rem_4.5rem_auto] items-center gap-1.5">
          <label className="min-w-0">
            <span className="sr-only">позиция</span>
            <input
              value={line.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              className="w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-sm"
            />
            {line.volume || line.temp ? (
              <span className="mt-0.5 block text-[10px] text-neutral-400">
                {[line.volume ? `${line.volume} мл` : '', line.temp === 'hot' ? 'горячий' : line.temp === 'cold' ? 'холодный' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </label>
          <label>
            <span className="sr-only">количество</span>
            <input
              inputMode="numeric"
              value={line.quantity}
              onChange={(e) => patch(i, { quantity: e.target.value.replace(/[^\d]/g, '') })}
              className="w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-center text-sm tabular-nums"
            />
          </label>
          <label>
            <span className="sr-only">цена</span>
            <input
              inputMode="numeric"
              value={line.price}
              onChange={(e) => patch(i, { price: e.target.value.replace(/[^\d]/g, '') })}
              className="w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-right text-sm tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={() => on_change({ ...sale, lines: sale.lines.filter((_, idx) => idx !== i) })}
            className="px-1 text-sm text-neutral-400"
            aria-label="убрать позицию"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          on_change({
            ...sale,
            lines: [...sale.lines, { menu_id: '', name: '', quantity: '1', price: '' }],
          })
        }
        className="text-xs font-semibold text-neutral-500"
      >
        + позиция
      </button>
      <p className="text-sm font-semibold tabular-nums text-neutral-900">
        {Math.round(total).toLocaleString('ru-RU')} ₽
      </p>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={on_save}
          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'пишу…' : 'сохранить'}
        </button>
        <button type="button" disabled={busy} onClick={on_remove} className="text-xs font-medium text-red-500">
          удалить
        </button>
      </div>
    </div>
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
