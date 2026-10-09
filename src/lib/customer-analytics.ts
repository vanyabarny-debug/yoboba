/** Аналитика клиента по заказам — всё в Europe/Moscow. */

export type analytics_period = 'week' | 'month' | 'all';
export type activity_mode = 'days' | 'hours';

export type analytics_order = {
  created_at: string;
  status: string;
  total_price: number;
  items: { menu_id?: string; name: string; quantity: number; volume?: string; kind?: string }[];
};

export const WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

/** подписи слотов 0–2 … 22–24 */
export const HOUR_BUCKET_LABELS = [
  '0',
  '2',
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  '18',
  '20',
  '22',
] as const;

const MSK = 'Europe/Moscow';

const weekday_to_index: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * День недели и час заказа в Москве.
 * Важно: hourCycle h24 (0–23). h23 даёт полночь как 24 → слот уезжал в 22–24.
 */
function msk_parts(iso: string): { weekday: number; hour: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { weekday: 0, hour: 0 };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MSK,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h24',
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  if (!Number.isFinite(hour)) hour = 0;
  // на всякий: движки иногда всё ещё отдают 24
  hour = ((hour % 24) + 24) % 24;
  return {
    weekday: weekday_to_index[wd] ?? 0,
    hour,
  };
}

function period_cutoff(period: analytics_period, now = new Date()): number | null {
  if (period === 'all') return null;
  const ms = period === 'week' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return now.getTime() - ms;
}

export function active_orders(
  orders: analytics_order[],
  period: analytics_period,
  now = new Date()
): analytics_order[] {
  const cut = period_cutoff(period, now);
  return orders.filter((o) => {
    if (o.status === 'cancelled') return false;
    if (cut == null) return true;
    return new Date(o.created_at).getTime() >= cut;
  });
}

export function drinks_count(orders: analytics_order[]): number {
  let n = 0;
  for (const o of orders) {
    for (const item of o.items) {
      if (item.kind === 'staff') continue;
      n += Math.max(0, Number(item.quantity) || 0);
    }
  }
  return n;
}

export function spent_sum(orders: analytics_order[]): number {
  return Math.round(orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0));
}

export function top_items(
  orders: analytics_order[],
  normalize_name: (name: string, volume?: string) => string,
  limit = 5
): { name: string; quantity: number; menu_id?: string }[] {
  const qty = new Map<string, { name: string; quantity: number; menu_id?: string }>();
  for (const o of orders) {
    for (const item of o.items) {
      if (item.kind === 'staff') continue;
      const name = normalize_name(item.name, item.volume);
      const key = item.menu_id || name.toLowerCase();
      const prev = qty.get(key) || { name, quantity: 0, menu_id: item.menu_id };
      prev.name = name;
      prev.quantity += Math.max(0, Number(item.quantity) || 0);
      if (item.menu_id) prev.menu_id = item.menu_id;
      qty.set(key, prev);
    }
  }
  return [...qty.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

/**
 * Активность по дням недели: сколько заказов пришлось на пн…вс
 * (по created_at в MSK). Не напитки, а визиты/заказы.
 */
export function by_weekday(orders: analytics_order[]): number[] {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const o of orders) {
    counts[msk_parts(o.created_at).weekday] += 1;
  }
  return counts;
}

/**
 * Активность по времени суток: 12 слотов по 2 часа (0–2 … 22–24), MSK.
 * Считаем заказы, не позиции.
 */
export function by_hour_bucket(orders: analytics_order[]): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const o of orders) {
    const h = msk_parts(o.created_at).hour;
    counts[Math.floor(h / 2)] += 1;
  }
  return counts;
}

/** средний темп напитков в неделю за окно периода */
export function drinks_per_week_rate(
  drinks: number,
  period: analytics_period,
  orders: analytics_order[],
  now = new Date()
): number | null {
  if (period === 'week' || drinks <= 0) return null;
  if (period === 'month') {
    return Math.round((drinks * 7) / 30 * 10) / 10;
  }
  // all time — от первого заказа до сейчас
  if (!orders.length) return null;
  let earliest = Infinity;
  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (t < earliest) earliest = t;
  }
  if (!Number.isFinite(earliest)) return null;
  const weeks = Math.max(1 / 7, (now.getTime() - earliest) / (7 * 24 * 60 * 60 * 1000));
  return Math.round((drinks / weeks) * 10) / 10;
}

export function peak_index(counts: number[]): number {
  let best = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[best]) best = i;
  }
  return best;
}

export function msk_ymd(iso: string | Date, now_fallback?: Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) {
    const fb = now_fallback ?? new Date();
    return msk_ymd(fb);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${mo}-${day}`;
}

export type rhythm_bucket = {
  avg_orders: number;
  avg_revenue: number;
  total_orders: number;
  total_revenue: number;
};

export type store_rhythm = {
  days_in_period: number;
  weekday: rhythm_bucket[];
  hour: rhythm_bucket[];
  weekday_counts: number[];
  today_weekday: number;
  today_hour_bucket: number;
  today_in_period: boolean;
  today_orders: number;
  today_revenue: number;
  today_hour_orders: number;
  today_hour_revenue: number;
};

/** каждый календарный день from…to (YYYY-MM-DD) */
function each_day_iso(from: string, to: string): string[] {
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 400; ) {
    out.push(d);
    const [y, m, day] = d.split('-').map(Number);
    const next = new Date(y, m - 1, day + 1);
    d = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  }
  return out;
}

/**
 * Усреднённый ритм точки за период:
 * — по дням недели: сумма за все пн / сколько пн было в периоде (то же для выручки);
 * — по времени: сумма в слоте / число календарных дней в периоде (среднее за день).
 */
export function compute_store_rhythm(
  orders: { created_at: string; total_price: number }[],
  from: string,
  to: string,
  now = new Date()
): store_rhythm {
  const days = each_day_iso(from, to);
  const days_in_period = Math.max(1, days.length);
  const weekday_counts = Array.from({ length: 7 }, () => 0);
  for (const d of days) {
    const wd = msk_parts(`${d}T12:00:00+03:00`).weekday;
    weekday_counts[wd] += 1;
  }
  for (let i = 0; i < 7; i++) {
    if (weekday_counts[i] === 0) weekday_counts[i] = 1;
  }

  const wd_orders = Array.from({ length: 7 }, () => 0);
  const wd_revenue = Array.from({ length: 7 }, () => 0);
  const hr_orders = Array.from({ length: 12 }, () => 0);
  const hr_revenue = Array.from({ length: 12 }, () => 0);

  const today_ymd = msk_ymd(now);
  const today_in_period = today_ymd >= (from <= to ? from : to) && today_ymd <= (from <= to ? to : from);
  const today_parts = msk_parts(now.toISOString());
  let today_orders = 0;
  let today_revenue = 0;
  let today_hour_orders = 0;
  let today_hour_revenue = 0;
  const today_slot = Math.floor(today_parts.hour / 2);

  for (const o of orders) {
    const rev = Math.round(Number(o.total_price) || 0);
    const { weekday, hour } = msk_parts(o.created_at);
    wd_orders[weekday] += 1;
    wd_revenue[weekday] += rev;
    const slot = Math.floor(hour / 2);
    hr_orders[slot] += 1;
    hr_revenue[slot] += rev;

    if (today_in_period && msk_ymd(o.created_at) === today_ymd) {
      today_orders += 1;
      today_revenue += rev;
      if (slot === today_slot) {
        today_hour_orders += 1;
        today_hour_revenue += rev;
      }
    }
  }

  const weekday: rhythm_bucket[] = Array.from({ length: 7 }, (_, i) => ({
    total_orders: wd_orders[i],
    total_revenue: wd_revenue[i],
    avg_orders: Math.round((wd_orders[i] / weekday_counts[i]) * 10) / 10,
    avg_revenue: Math.round(wd_revenue[i] / weekday_counts[i]),
  }));

  const hour: rhythm_bucket[] = Array.from({ length: 12 }, (_, i) => ({
    total_orders: hr_orders[i],
    total_revenue: hr_revenue[i],
    avg_orders: Math.round((hr_orders[i] / days_in_period) * 10) / 10,
    avg_revenue: Math.round(hr_revenue[i] / days_in_period),
  }));

  return {
    days_in_period,
    weekday,
    hour,
    weekday_counts,
    today_weekday: today_parts.weekday,
    today_hour_bucket: Math.floor(today_parts.hour / 2),
    today_in_period,
    today_orders,
    today_revenue,
    today_hour_orders,
    today_hour_revenue,
  };
}
