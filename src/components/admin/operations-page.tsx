'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/admin/admin-shell';
import { useAdminSpot } from '@/components/admin/admin-spot-context';
import DiscountFields from '@/components/admin/discount-fields';
import { useCatalogUnit } from '@/components/admin/use-catalog-unit';
import type {
  ledger_due,
  ledger_entry,
  ledger_kind,
  ledger_material,
  ledger_receipt,
  ledger_schedule_row,
} from '@/lib/admin-operations-server';
import { unit_labels, type material_unit } from '@/lib/finance/model';
import { normalize_order_item_fields } from '@/lib/order-item-name';
import { spread_total } from '@/lib/pos-pricing';
import type { order_item } from '@/lib/types';

type feed = {
  entries?: ledger_entry[];
  cash?: number;
  card?: number;
  balance?: number;
  anchor?: { at: string; cash: number; card: number } | null;
  opex?: { id: string; name: string }[];
  materials?: ledger_material[];
  shelves?: { id: string; name: string }[];
  must_count?: boolean;
  due?: ledger_due[];
  receipts?: ledger_receipt[];
  schedule?: ledger_schedule_row[];
  error?: string;
};

type manual_kind = Exclude<ledger_kind, 'sale' | 'payroll'>;

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
  months: string;
  /** выбран ингредиент со склада — закупка ляжет приходом */
  material_id: string;
  quantity: string;
  /** такой позиции на складе нет — заведём по названию */
  new_material: boolean;
  new_unit: material_unit;
  new_shelf: string;
};

const new_units: material_unit[] = ['kg', 'g', 'L', 'ml', 'pcs'];

type sale_line = {
  menu_id: string;
  name: string;
  quantity: string;
  price: string;
  /** цена по меню за штуку — от неё считается скидка */
  list_price: string;
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
  payroll: 'зарплата',
  capex: 'оборудование',
};

const kind_order: ledger_kind[] = [
  'sale',
  'purchase',
  'expense',
  'collection',
  'financing',
  'fixed',
  'payroll',
  'capex',
];

const manual_order: manual_kind[] = ['expense', 'purchase', 'collection', 'financing', 'fixed', 'capex'];

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

/** деньги дня: что реально пришло в кассу минус что ушло. себестоимость — не деньги, инкассация — перекладывание */
function day_cash(items: ledger_entry[]) {
  return items.reduce((sum, entry) => {
    if (!entry.counts || entry.kind === 'collection' || entry.direction === 'move') return sum;
    return entry.direction === 'out' ? sum - entry.amount : sum + entry.amount;
  }, 0);
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
  if (kind === 'payroll') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function DayTotal({ day, today, items }: { day: string; today: string; items: ledger_entry[] }) {
  const net = day_cash(items);
  const tone = net > 0 ? 'text-emerald-600' : net < 0 ? 'text-red-500' : 'text-neutral-400';
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  return (
    <h2 className="flex min-w-0 items-baseline gap-2 text-xs font-medium tabular-nums">
      <span className="text-neutral-400">{day_heading(day, today)}</span>
      <span className={tone}>
        {sign}
        {rub(Math.abs(net))}
      </span>
    </h2>
  );
}

async function fetch_feed(spot_id: string) {
  const qs = new URLSearchParams({ feed: '1' });
  if (spot_id) qs.set('spot_id', spot_id);
  const res = await fetch(`/api/admin/operations?${qs}`, { credentials: 'same-origin' });
  return (await res.json()) as feed;
}

export default function operations_page() {
  return (
    <AdminShell>
      <OperationsBody />
    </AdminShell>
  );
}

function OperationsBody() {
  const { spot_id, spot_options } = useAdminSpot();
  const [entries, set_entries] = useState<ledger_entry[]>([]);
  const [cash, set_cash] = useState(0);
  const [card, set_card] = useState(0);
  const [balance, set_balance] = useState(0);
  const [loading, set_loading] = useState(true);
  const [error, set_error] = useState('');
  const [open_id, set_open_id] = useState<string | null>(null);
  const [panel, set_panel] = useState<'filter' | 'sort' | 'payments' | null>(null);
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
  const [materials, set_materials] = useState<ledger_material[]>([]);
  const [shelves, set_shelves] = useState<{ id: string; name: string }[]>([]);
  const [must_count, set_must_count] = useState(false);
  const [due, set_due] = useState<ledger_due[]>([]);
  const [receipts, set_receipts] = useState<ledger_receipt[]>([]);
  const [schedule, set_schedule] = useState<ledger_schedule_row[]>([]);
  const [due_busy, set_due_busy] = useState<string | null>(null);
  const [draft, set_draft] = useState<draft | null>(null);
  /** день, под которым открыта форма; null — наверху ленты */
  const [form_day, set_form_day] = useState<string | null>(null);
  const [sale, set_sale] = useState<sale_draft | null>(null);
  const [form_error, set_form_error] = useState('');
  const [form_busy, set_form_busy] = useState(false);
  const [pay_busy, set_pay_busy] = useState<string | null>(null);
  const catalog_unit = useCatalogUnit();
  const today = ymd_moscow(new Date().toISOString());
  const spot_label = useMemo(() => {
    const map = new Map(spot_options.map((s) => [s.id, s.label]));
    return (id: string | null) => (id ? map.get(id) || '' : '');
  }, [spot_options]);

  const apply_feed = useCallback((body: feed) => {
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
    set_materials(body.materials || []);
    set_shelves(body.shelves || []);
    set_must_count(Boolean(body.must_count));
    set_due(body.due || []);
    set_receipts(body.receipts || []);
    set_schedule(body.schedule || []);
  }, []);

  const reload = useCallback(async () => {
    set_loading(true);
    set_error('');
    try {
      apply_feed(await fetch_feed(spot_id));
    } catch {
      set_error('не удалось загрузить операции');
    } finally {
      set_loading(false);
    }
  }, [spot_id, apply_feed]);

  const [feed_for, set_feed_for] = useState(spot_id);
  if (feed_for !== spot_id) {
    set_feed_for(spot_id);
    set_loading(true);
    set_error('');
  }

  useEffect(() => {
    fetch_feed(spot_id)
      .then(apply_feed)
      .catch(() => set_error('не удалось загрузить операции'))
      .finally(() => set_loading(false));
  }, [spot_id, apply_feed]);

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
    if (due.length + receipts.length && !groups.some((group) => group.day === today)) {
      if (sort === 'new') groups.unshift({ day: today, items: [] });
      else groups.push({ day: today, items: [] });
    }
    return groups;
  }, [visible, sort, due.length, receipts.length, today]);

  async function confirm_receipt(item: ledger_receipt, pay: { amount: number; day: string; channel: 'cash' | 'card' }) {
    const key = `rc:${item.tx_id}`;
    set_due_busy(key);
    set_error('');
    try {
      const time = pay.day === today ? moscow_parts().time : '12:00';
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ledger: {
            id: item.tx_id,
            kind: 'purchase',
            amount: pay.amount,
            title: item.title,
            at: `${pay.day}T${time}:00+03:00`,
            channel: pay.channel,
            spot_id: spot_id || '',
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось подтвердить поставку');
        return false;
      }
      await reload();
      return true;
    } catch {
      set_error('не удалось подтвердить поставку');
      return false;
    } finally {
      set_due_busy(null);
    }
  }

  async function confirm_due(item: ledger_due, pay: { amount: number; day: string; channel: 'cash' | 'card' }) {
    const key = due_key(item);
    set_due_busy(key);
    set_error('');
    try {
      const time = pay.day === today ? moscow_parts().time : '12:00';
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ledger: {
            kind: 'fixed',
            category_id: item.category_id,
            amount: pay.amount,
            title: item.label ? `${item.label} · ${item.name}` : item.name,
            at: `${pay.day}T${time}:00+03:00`,
            channel: pay.channel,
            for_month: item.month,
            ...(item.line_id ? { payroll_line: item.line_id } : {}),
            spot_id: spot_id || '',
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось подтвердить оплату');
        return false;
      }
      await reload();
      return true;
    } catch {
      set_error('не удалось подтвердить оплату');
      return false;
    } finally {
      set_due_busy(null);
    }
  }

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

  function open_add(day?: string, preset?: Partial<draft>) {
    const now = moscow_parts();
    set_sale(null);
    set_form_error('');
    set_panel(null);
    set_form_day(day || null);
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
      months: '24',
      material_id: '',
      quantity: '',
      new_material: false,
      new_unit: 'kg',
      new_shelf: shelves[0]?.id || '',
      ...preset,
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
        const catalog = catalog_unit({ menu_id: item.menu_id, volume: normalized.volume });
        const list = Math.max(item.price, item.list_price ?? (item.kind === 'staff' ? 0 : catalog ?? 0));
        return {
          menu_id: item.menu_id || '',
          name: normalized.name,
          quantity: String(item.quantity),
          price: String(item.price),
          list_price: String(list),
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
    set_form_day(parts.day);
    set_draft({
      id: entry.id.slice(3),
      kind: entry.kind === 'payroll' ? 'fixed' : entry.kind,
      amount: String(entry.amount),
      title: entry.title,
      day: parts.day,
      time: parts.time,
      channel: entry.kind === 'collection' ? 'cash' : entry.channel === 'card' ? 'card' : 'cash',
      category_id: entry.category_id || opex[0]?.id || '',
      stock_linked: entry.stock_linked,
      months: String(entry.months ?? 24),
      material_id: '',
      quantity: '',
      new_material: false,
      new_unit: 'kg',
      new_shelf: shelves[0]?.id || '',
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
            ...(draft.kind === 'capex' ? { months: Number(draft.months) || 24 } : {}),
            ...(!draft.id && draft.kind === 'purchase' && draft.material_id
              ? { material_id: draft.material_id, quantity: Number(draft.quantity.replace(',', '.')) }
              : !draft.id && draft.kind === 'purchase' && draft.new_material
                ? {
                    new_material: { unit: draft.new_unit, category: draft.new_shelf },
                    quantity: Number(draft.quantity.replace(',', '.')),
                  }
                : {}),
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
        const price = Math.round(Number(String(line.price).replace(/\s/g, '')));
        const list_price = Math.round(Number(line.list_price) || 0);
        return {
          menu_id: line.menu_id,
          name: normalized.name,
          quantity: Math.round(Number(line.quantity)),
          price,
          ...(list_price > price ? { list_price } : {}),
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
  const inline_day = form_day && grouped.some((group) => group.day === form_day) ? form_day : null;
  const form = draft ? (
    <OperationForm
      key={draft.id || `new-${form_day || 'top'}`}
      draft={draft}
      opex={opex}
      materials={materials}
      shelves={shelves}
      must_count={must_count}
      busy={form_busy}
      error={form_error}
      on_change={set_draft}
      on_save={() => void save_draft()}
      on_remove={draft.id && !draft.stock_linked ? () => void remove_draft() : null}
      on_close={() => set_draft(null)}
    />
  ) : null;

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

      <div className="flex items-center justify-end gap-1">
        <IconButton
          label="фильтрация"
          active={panel === 'filter'}
          dot={filters_on}
          onClick={() => set_panel((p) => (p === 'filter' ? null : 'filter'))}
        >
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="10" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
        </IconButton>
        <IconButton
          label="сортировка"
          active={panel === 'sort'}
          dot={sort !== 'new'}
          onClick={() => set_panel((p) => (p === 'sort' ? null : 'sort'))}
        >
          <path d="M8 5v14M8 5 5 8M8 5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 19V5M16 19l-3-3M16 19l3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </IconButton>
        <IconButton
          label="платежи"
          active={panel === 'payments'}
          dot={due.length > 0}
          onClick={() => set_panel((p) => (p === 'payments' ? null : 'payments'))}
        >
          <rect x="4" y="5.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </IconButton>
        <IconButton
          label={draft?.id ? 'правка' : 'добавить'}
          active={Boolean(draft)}
          onClick={() => (draft ? set_draft(null) : open_add())}
        >
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </IconButton>
      </div>

      {panel === 'payments' ? (
        <PaymentsPanel rows={schedule} on_saved={reload} on_close={() => set_panel(null)} />
      ) : null}

      {draft && !inline_day ? form : null}

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
                  onClick={() =>
                    draft && !draft.id && inline_day === group.day ? set_draft(null) : open_add(group.day)
                  }
                  className="grid h-7 w-7 shrink-0 place-items-center text-lg font-semibold leading-none text-neutral-500"
                >
                  +
                </button>
              </div>
            ) : null}
            {inline_day && inline_day === group.day ? form : null}
            <ul className="space-y-2">
              {group.day === today || (!group.day && receipts.length)
                ? receipts.map((item) => (
                    <li key={`rc-${item.tx_id}`}>
                      <ReceiptDueCard
                        item={item}
                        today={today}
                        busy={due_busy === `rc:${item.tx_id}`}
                        on_confirm={(pay) => confirm_receipt(item, pay)}
                      />
                    </li>
                  ))
                : null}
              {group.day === today || (!group.day && due.length)
                ? due.map((item) => {
                    const key = due_key(item);
                    return (
                      <li key={`due-${key}`}>
                        <DueCard
                          item={item}
                          today={today}
                          busy={due_busy === key}
                          on_confirm={(pay) => confirm_due(item, pay)}
                        />
                      </li>
                    );
                  })
                : null}
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

function IconButton({
  label,
  active,
  dot,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  dot?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`relative grid h-9 w-9 place-items-center transition-colors ${
        active ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        {children}
      </svg>
      {dot ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
    </button>
  );
}

function month_name(month: string) {
  return new Date(`${month}-15T12:00:00+03:00`).toLocaleDateString('ru-RU', {
    month: 'long',
    timeZone: 'Europe/Moscow',
  });
}

function due_key(item: ledger_due) {
  return `${item.category_id}:${item.month}:${item.line_id || ''}`;
}

function days_between(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T12:00:00+03:00`).getTime() - new Date(`${from}T12:00:00+03:00`).getTime()) / 86_400_000
  );
}

function DueCard({
  item,
  today,
  busy,
  on_confirm,
}: {
  item: ledger_due;
  today: string;
  busy: boolean;
  on_confirm: (pay: { amount: number; day: string; channel: 'cash' | 'card' }) => Promise<boolean>;
}) {
  const [open, set_open] = useState(false);
  const [amount, set_amount] = useState(item.plan ? String(item.plan) : '');
  const [day, set_day] = useState(today);
  const [channel, set_channel] = useState<'cash' | 'card'>('card');
  const late = days_between(item.due, today);
  const value = Number(amount.replace(/\s/g, ''));
  const diff = item.plan && value > 0 ? value - item.plan : 0;
  return (
    <article className="rounded-2xl bg-white px-3 py-3 ring-1 ring-amber-300">
      <button type="button" onClick={() => set_open((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="4" y="5.5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-900">
            {item.line_id ? 'выплатить зарплату' : 'к оплате'}
          </span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {item.label ? `${item.label} · ` : ''}
            {item.name}
            <span className="text-neutral-300"> · </span>
            {late > 0 ? <span className="text-amber-700">ждёт {late} дн.</span> : 'сегодня'}
            {item.month !== today.slice(0, 7) ? ` · за ${month_name(item.month)}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
          {item.plan ? rub(item.plan) : '—'}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-500">
              заплатили, ₽
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => set_amount(e.target.value.replace(/[^\d\s]/g, ''))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-[11px] text-neutral-500">
              когда платили
              <input
                type="date"
                value={day}
                max={today}
                onChange={(e) => set_day(e.target.value || today)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ['card', 'безнал'],
                ['cash', 'нал'],
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
          <p className="text-[11px] leading-snug text-neutral-400">
            {item.line_id ? 'по персоналу' : 'план'} {item.plan ? rub(item.plan) : 'не задан'}
            {diff ? ` · ${diff > 0 ? 'больше' : 'меньше'} на ${rub(Math.abs(diff))}` : ''}.{' '}
            {item.line_id
              ? `сумма запишется в ФОТ за ${month_name(item.month)}`
              : `сумма заменит план в аналитике за ${month_name(item.month)}`}
          </p>
          <button
            type="button"
            disabled={busy || !(value > 0)}
            onClick={async () => {
              if (await on_confirm({ amount: value, day, channel })) set_open(false);
            }}
            className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'записываю…' : 'подтвердить оплату'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

const receipt_gap_text = { sum: 'без суммы', date: 'без даты', both: 'без суммы и даты' } as const;

function ReceiptDueCard({
  item,
  today,
  busy,
  on_confirm,
}: {
  item: ledger_receipt;
  today: string;
  busy: boolean;
  on_confirm: (pay: { amount: number; day: string; channel: 'cash' | 'card' }) => Promise<boolean>;
}) {
  const [open, set_open] = useState(false);
  const [amount, set_amount] = useState(item.amount ? String(item.amount) : '');
  const [day, set_day] = useState(item.date || today);
  const [channel, set_channel] = useState<'cash' | 'card'>(item.channel);
  const late = days_between(item.since, today);
  const value = Number(amount.replace(/\s/g, ''));
  return (
    <article className="rounded-2xl bg-white px-3 py-3 ring-1 ring-amber-300">
      <button type="button" onClick={() => set_open((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M4 8l8 4 8-4M12 12v8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-neutral-900">подтвердить поставку</span>
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {item.material || item.title}
            {item.qty ? ` · ${item.qty}` : ''}
            <span className="text-neutral-300"> · </span>
            <span className="text-amber-700">{receipt_gap_text[item.gap]}</span>
            {late > 0 ? ` · ждёт ${late} дн.` : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
          {item.amount ? rub(item.amount) : '—'}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-500">
              сумма накладной, ₽
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => set_amount(e.target.value.replace(/[^\d\s]/g, ''))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm tabular-nums"
              />
            </label>
            <label className="text-[11px] text-neutral-500">
              когда платили
              <input
                type="date"
                value={day}
                max={today}
                onChange={(e) => set_day(e.target.value || today)}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ['card', 'безнал'],
                ['cash', 'нал'],
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
          <p className="text-[11px] leading-snug text-neutral-400">
            на складе уже лежит. после подтверждения закупка попадёт в кассу этого дня, а партия получит цену
          </p>
          <button
            type="button"
            disabled={busy || !(value > 0)}
            onClick={async () => {
              if (await on_confirm({ amount: value, day, channel })) set_open(false);
            }}
            className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'записываю…' : 'подтвердить поставку'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function PaymentsPanel({
  rows,
  on_saved,
  on_close,
}: {
  rows: ledger_schedule_row[];
  on_saved: () => Promise<void>;
  on_close: () => void;
}) {
  const [edit, set_edit] = useState<{
    id: string;
    name: string;
    plan: string;
    day: string;
    payroll: boolean;
  } | null>(null);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const planned = rows.filter((row) => row.pay_day);
  const other = rows.filter((row) => !row.pay_day);

  async function save() {
    if (!edit || busy) return;
    set_busy(true);
    set_error('');
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schedule: {
            ...(edit.id ? { id: edit.id } : {}),
            name: edit.name.trim(),
            plan: Number(edit.plan.replace(/\s/g, '')) || 0,
            pay_day: edit.day ? Number(edit.day) : null,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        set_error(body.error || 'не удалось сохранить');
        return;
      }
      set_edit(null);
      await on_saved();
    } catch {
      set_error('не удалось сохранить');
    } finally {
      set_busy(false);
    }
  }

  function row_view(row: ledger_schedule_row) {
    if (edit?.id === row.id) return editor();
    return (
      <li key={row.id}>
        <button
          type="button"
          onClick={() =>
            set_edit({
              id: row.id,
              name: row.name,
              plan: String(row.plan || ''),
              day: row.pay_day ? String(row.pay_day) : '',
              payroll: row.payroll,
            })
          }
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-neutral-900">{row.name}</span>
            <span className="block text-[11px] text-neutral-400">
              {row.pay_day ? `${row.pay_day} числа` : 'без даты'}
              {row.payroll ? ' · по сотрудникам из персонала' : ''}
              {row.paid > 0 ? ` · ${row.payroll ? 'выплачено' : 'оплачено'} ${rub(row.paid)}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-sm tabular-nums text-neutral-700">{row.plan ? rub(row.plan) : '—'}</span>
        </button>
      </li>
    );
  }

  function editor() {
    if (!edit) return null;
    return (
      <li key={edit.id || 'new'} className="space-y-2 bg-neutral-50 px-3 py-3">
        {edit.payroll ? (
          <p className="text-sm font-medium text-neutral-900">{edit.name}</p>
        ) : (
          <input
            value={edit.name}
            onChange={(e) => set_edit({ ...edit, name: e.target.value })}
            placeholder="аренда, свет, интернет…"
            autoFocus={!edit.id}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-highlight"
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {edit.payroll ? (
            <p className="text-[11px] leading-snug text-neutral-500">
              суммы — из карточек персонала на дашборде. в число выплаты по каждому сотруднику появится «выплатить
              зарплату»
            </p>
          ) : (
            <label className="text-[11px] text-neutral-500">
              сумма в месяц, ₽
              <input
                inputMode="numeric"
                value={edit.plan}
                onChange={(e) => set_edit({ ...edit, plan: e.target.value.replace(/[^\d\s]/g, '') })}
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm tabular-nums"
              />
            </label>
          )}
          <label className="text-[11px] text-neutral-500">
            число платежа
            <input
              inputMode="numeric"
              value={edit.day}
              placeholder="без даты"
              onChange={(e) => set_edit({ ...edit, day: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm tabular-nums"
            />
          </label>
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy || !edit.name.trim()}
            onClick={() => void save()}
            className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'сохраняю…' : 'сохранить'}
          </button>
          <button type="button" onClick={() => set_edit(null)} className="text-xs font-medium text-neutral-500">
            отмена
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white">
      <div className="flex items-start justify-between gap-3 px-3 pb-2 pt-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">платежи</p>
          <p className="text-[11px] leading-snug text-neutral-400">
            в число платежа в ленте появится «к оплате». подтвердите сумму — она уйдёт в аналитику месяца. не
            подтвердили — карточка висит каждый день
          </p>
        </div>
        <button type="button" onClick={on_close} className="shrink-0 text-xs font-medium text-neutral-500">
          закрыть
        </button>
      </div>
      <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
        {planned.map(row_view)}
        {other.map(row_view)}
        {edit && !edit.id ? editor() : null}
      </ul>
      {!edit ? (
        <button
          type="button"
          onClick={() => set_edit({ id: '', name: '', plan: '', day: '', payroll: false })}
          className="w-full border-t border-neutral-100 px-3 py-2.5 text-left text-xs font-semibold text-neutral-700"
        >
          + платёж
        </button>
      ) : null}
    </section>
  );
}

function search_key(text: string) {
  return text.trim().toLowerCase().replace(/ё/g, 'е');
}

function OperationForm({
  draft,
  opex,
  materials,
  shelves,
  must_count,
  busy,
  error,
  on_change,
  on_save,
  on_remove,
  on_close,
}: {
  draft: draft;
  opex: { id: string; name: string }[];
  materials: ledger_material[];
  shelves: { id: string; name: string }[];
  must_count: boolean;
  busy: boolean;
  error: string;
  on_change: (next: draft) => void;
  on_save: () => void;
  on_remove: (() => void) | null;
  on_close: () => void;
}) {
  const kinds = opex.length ? manual_order : manual_order.filter((kind) => kind !== 'fixed');
  const box_ref = useRef<HTMLElement>(null);
  useEffect(() => {
    box_ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  const [suggest_open, set_suggest_open] = useState(false);
  const [active, set_active] = useState(0);
  const can_pick = !draft.id && (draft.kind === 'expense' || draft.kind === 'purchase');
  const picked = draft.material_id ? materials.find((m) => m.id === draft.material_id) : undefined;
  const fresh = !picked && draft.new_material && draft.kind === 'purchase';
  const query = search_key(draft.title);
  const exact = query ? materials.some((m) => search_key(m.name) === query) : false;
  const suggestions = useMemo(() => {
    if (!can_pick || picked) return [];
    if (!query && draft.kind !== 'purchase') return [];
    const hits = query ? materials.filter((m) => search_key(m.name).includes(query)) : materials;
    return [...hits].sort((a, b) => {
      if (!query) return a.name.localeCompare(b.name, 'ru');
      const a_start = search_key(a.name).startsWith(query) ? 0 : 1;
      const b_start = search_key(b.name).startsWith(query) ? 0 : 1;
      return a_start - b_start || a.name.localeCompare(b.name, 'ru');
    });
  }, [can_pick, picked, query, draft.kind, materials]);
  const offer_new = can_pick && !picked && !fresh && Boolean(query) && !exact;
  const options: (ledger_material | null)[] = offer_new ? [...suggestions, null] : suggestions;
  const show_suggest = suggest_open && options.length > 0;
  const unit = picked ? unit_labels[picked.unit] : fresh ? unit_labels[draft.new_unit] : '';
  const qty = Number(draft.quantity.replace(',', '.'));
  const per_unit = (picked || fresh) && qty > 0 && Number(draft.amount) > 0 ? Number(draft.amount) / qty : 0;

  function pick(m: ledger_material | null) {
    if (m) on_change({ ...draft, title: m.name, kind: 'purchase', material_id: m.id, new_material: false });
    else on_change({ ...draft, title: draft.title.trim(), kind: 'purchase', material_id: '', new_material: true });
    set_suggest_open(false);
  }
  return (
    <section
      ref={box_ref}
      className="scroll-mt-24 space-y-3 rounded-2xl border border-neutral-200/80 bg-white p-3"
    >
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
              onClick={() =>
                on_change({ ...draft, kind, ...(kind === 'purchase' ? {} : { material_id: '', new_material: false }) })
              }
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
      {draft.kind === 'capex' ? (
        <label className="block text-[11px] text-neutral-500">
          срок службы, мес
          <input
            inputMode="numeric"
            value={draft.months}
            onChange={(e) => on_change({ ...draft, months: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
          />
          <span className="mt-1 block leading-snug text-neutral-400">
            в прибыль не падает разом — каждый месяц списывается амортизация
            {Number(draft.amount) > 0 && Number(draft.months) > 0
              ? ` ≈ ${rub(Number(draft.amount) / Number(draft.months))}/мес`
              : ''}
          </span>
        </label>
      ) : null}
      {draft.kind === 'expense' ? (
        <p className="text-[11px] leading-snug text-neutral-400">
          разовая трата вне постоянных статей — попадёт в «непредвиденные» на дашборде
        </p>
      ) : null}
      <div className="relative">
        <label className="block text-[11px] text-neutral-500">
          что это
          <input
            value={draft.title}
            role={can_pick ? 'combobox' : undefined}
            aria-expanded={can_pick ? show_suggest : undefined}
            aria-autocomplete={can_pick ? 'list' : undefined}
            autoComplete="off"
            onChange={(e) => {
              on_change({ ...draft, title: e.target.value, material_id: '' });
              set_suggest_open(true);
              set_active(0);
            }}
            onFocus={() => set_suggest_open(true)}
            onClick={() => set_suggest_open(true)}
            onBlur={() => set_suggest_open(false)}
            onKeyDown={(e) => {
              if (!show_suggest) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                set_active((i) => (i + 1) % options.length);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                set_active((i) => (i - 1 + options.length) % options.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(options[Math.min(active, options.length - 1)]);
              } else if (e.key === 'Escape') {
                set_suggest_open(false);
              }
            }}
            placeholder={
              draft.kind === 'capex'
                ? 'кофемашина, холодильник'
                : draft.kind === 'purchase' && can_pick
                  ? 'начните вводить ингредиент'
                  : 'чай, аренда, инкассация'
            }
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
          />
        </label>
        {show_suggest ? (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {options.map((m, i) => (
              <li key={m?.id ?? 'new'} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => set_active(i)}
                  onClick={() => pick(m)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    m ? 'text-neutral-900' : 'border-t border-neutral-100 font-medium text-neutral-900'
                  } ${i === active ? 'bg-neutral-100' : ''}`}
                >
                  {m ? (
                    <>
                      <span className="min-w-0 truncate">{m.name}</span>
                      <span className="shrink-0 text-[11px] text-neutral-400">склад · {unit_labels[m.unit]}</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 truncate">+ новая позиция «{draft.title.trim()}»</span>
                      <span className="shrink-0 text-[11px] text-neutral-400">поступление</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {picked || fresh ? (
        <div className="space-y-1.5 rounded-xl bg-neutral-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium text-neutral-900">
              {picked ? `на склад: ${picked.name}` : `новая позиция: ${draft.title.trim() || '…'}`}
            </p>
            <button
              type="button"
              onClick={() => on_change({ ...draft, material_id: '', new_material: false, quantity: '' })}
              className="shrink-0 text-[11px] font-medium text-neutral-500"
            >
              не на склад
            </button>
          </div>
          {fresh ? (
            <>
              <div className="text-[11px] text-neutral-500">
                в чём считать
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {new_units.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => on_change({ ...draft, new_unit: id })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        draft.new_unit === id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 ring-1 ring-neutral-200'
                      }`}
                    >
                      {unit_labels[id]}
                    </button>
                  ))}
                </div>
              </div>
              {shelves.length ? (
                <div className="text-[11px] text-neutral-500">
                  полка
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {shelves.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => on_change({ ...draft, new_shelf: row.id })}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          draft.new_shelf === row.id
                            ? 'bg-neutral-900 text-white'
                            : 'bg-white text-neutral-600 ring-1 ring-neutral-200'
                        }`}
                      >
                        {row.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <label className="block text-[11px] text-neutral-500">
            количество, {unit}
            <input
              inputMode="decimal"
              value={draft.quantity}
              onChange={(e) => on_change({ ...draft, quantity: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
            />
          </label>
          <p className="text-[11px] leading-snug text-neutral-400">
            {must_count
              ? 'склад ждёт первую инвентаризацию — сначала проведите её в разделе склада'
              : `${fresh ? 'заведём на складе и проведём поступление' : 'ляжет приходом на склад'}${
                  per_unit ? ` · ${per_unit.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽ за ${unit}` : ''
                }`}
          </p>
        </div>
      ) : can_pick && draft.kind === 'purchase' ? (
        <p className="text-[11px] leading-snug text-neutral-400">
          выберите ингредиент из списка или заведите новую позицию — закупка сразу ляжет на склад
        </p>
      ) : null}
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
  const list_of = (line: sale_line) => Math.max(Number(line.list_price) || 0, Number(line.price) || 0);
  const list_total = sale.lines.reduce((sum, line) => sum + list_of(line) * (Number(line.quantity) || 0), 0);
  function patch(i: number, next: Partial<sale_line>) {
    on_change({
      ...sale,
      lines: sale.lines.map((line, idx) => (idx === i ? { ...line, ...next } : line)),
    });
  }
  function apply_sold(target: number) {
    const units = spread_total(
      sale.lines.map((line) => ({ unit: list_of(line), qty: Math.max(1, Number(line.quantity) || 1) })),
      target
    );
    on_change({
      ...sale,
      lines: sale.lines.map((line, i) => ({ ...line, list_price: String(list_of(line)), price: String(units[i]) })),
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
            {line.volume || line.temp || list_of(line) > (Number(line.price) || 0) ? (
              <span className="mt-0.5 block text-[10px] text-neutral-400">
                {[
                  line.volume ? `${line.volume} мл` : '',
                  line.temp === 'hot' ? 'горячий' : line.temp === 'cold' ? 'холодный' : '',
                  list_of(line) > (Number(line.price) || 0) ? `по меню ${list_of(line)} ₽` : '',
                ]
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
            lines: [...sale.lines, { menu_id: '', name: '', quantity: '1', price: '', list_price: '' }],
          })
        }
        className="text-xs font-semibold text-neutral-500"
      >
        + позиция
      </button>
      {list_total > 0 ? <DiscountFields list_total={list_total} sold_total={total} on_sold={apply_sold} /> : null}
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
