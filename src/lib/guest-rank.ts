/**
 * Уровень гостя и возвращаемость после первого напитка.
 *
 * Частота важнее разового всплеска: ежедневный гость приносит в разы больше
 * разового, но еженедельный ритм (например каждое воскресенье 2–4 стакана)
 * — тот же класс «свой», не серый прохожий.
 * Разовый счёт за 7 дней поднимает выше ритма. Общий стаж (40 / 100 / 250)
 * двигает ещё дальше, даже если эта неделя тихая.
 */

const MSK = 'Europe/Moscow';
const DAY_MS = 24 * 60 * 60 * 1000;

export type guest_kind_id = 'new' | 'second' | 'sometimes' | 'regular' | 'legend';

export type guest_kind = {
  id: guest_kind_id;
  name: string;
  color: string;
  weight: number;
  /** кто входит в этот цвет */
  who: string;
};

/** официальные типы по цвету имени, от серого к фиолетовому */
export const GUEST_KINDS: guest_kind[] = [
  {
    id: 'new',
    name: 'новичок',
    color: '#737373',
    weight: 500,
    who: 'первый напиток или ещё без покупки',
  },
  {
    id: 'second',
    name: 'второй раз',
    color: '#737373',
    weight: 500,
    who: '2–3 напитка: зашёл ещё раз, привычки пока нет',
  },
  {
    id: 'sometimes',
    name: 'иногда заходит',
    color: '#171717',
    weight: 600,
    who: 'берёт время от времени, каждую неделю ещё не держит',
  },
  {
    id: 'regular',
    name: 'постоянник',
    color: '#1d4ed8',
    weight: 700,
    who: 'почти каждую неделю, или 5 напитков за последние 7 дней',
  },
  {
    id: 'legend',
    name: 'легенда',
    color: '#4c1d95',
    weight: 800,
    who: '6 и больше за неделю, или большой стаж — уровень 15 и выше',
  },
];

export function kind_of_rank(rank: number): guest_kind {
  if (rank <= 1) return GUEST_KINDS[0];
  if (rank <= 3) return GUEST_KINDS[1];
  if (rank <= 10) return GUEST_KINDS[2];
  if (rank <= 14) return GUEST_KINDS[3];
  return GUEST_KINDS[4];
}

/** точка у новичка: зелёная / жёлтая / красная */
export type fresh_tone = 'hot' | 'nudge' | 'gone';

export type guest_level = {
  /** показанный уровень: базовый плюс временный +1 за быстрый визит */
  rank: number;
  /** уровень без бонуса за сжатие интервала */
  base_rank: number;
  /** номер рядом с именем */
  name: string;
  kind: guest_kind_id;
  /** новичок, второй раз, иногда заходит, постоянник, легенда */
  type_name: string;
  /** цвет типа, без бледности */
  color: string;
  /** 500…800 */
  weight: number;
  /** кто входит в этот тип */
  who: string;
  hint: string;
  /** последний визит был в пределах 4 дней после предыдущего, бонус держится 7 дней */
  rush: boolean;
  /** уровень 4+ и с последнего визита больше 14 дней */
  cooling: boolean;
  /** календарных дней с последнего напитка, по Москве */
  days_since: number | null;
  /** только уровни 0–3 */
  fresh: fresh_tone | null;
};

/** цвет имени: остывший статус того же оттенка, но бледнее */
export function level_ink(level: { color: string; cooling?: boolean }): string {
  if (!level.cooling) return level.color;
  const hex = level.color.replace('#', '');
  if (hex.length !== 6) return level.color;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return level.color;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.5);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function paint(rank: number): { color: string; weight: number } {
  const kind = kind_of_rank(rank);
  return { color: kind.color, weight: kind.weight };
}

export type guest_rank_order = {
  created_at: string;
  status: string;
  items: { quantity?: number; kind?: string; name?: string; category?: string }[];
};

function msk_parts(iso: string): { ymd: string; weekday: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { ymd: '', weekday: 0 };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MSK,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const weekday_to_index: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return { ymd: `${y}-${mo}-${day}`, weekday: weekday_to_index[wd] ?? 0 };
}

/** понедельник недели для календарной даты YYYY-MM-DD */
function week_monday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  const wd = date.getUTCDay();
  const shift = wd === 0 ? -6 : 1 - wd;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function drink_qty(order: guest_rank_order): number {
  if (order.status === 'cancelled') return 0;
  let n = 0;
  for (const item of order.items || []) {
    if (item.kind === 'staff') continue;
    n += Math.max(0, Number(item.quantity) || 0);
  }
  return n;
}

type drink_hit = { at: number; ymd: string; weekday: number; qty: number };

function drink_hits(orders: guest_rank_order[]): drink_hit[] {
  const hits: drink_hit[] = [];
  for (const order of orders) {
    const qty = drink_qty(order);
    if (qty <= 0) continue;
    const at = new Date(order.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    const parts = msk_parts(order.created_at);
    hits.push({ at, ymd: parts.ymd, weekday: parts.weekday, qty });
  }
  hits.sort((a, b) => a.at - b.at);
  return hits;
}

function drinks_word(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'напиток';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'напитка';
  return 'напитков';
}

function describe(total: number, drinks_7d: number, habit: boolean): string {
  if (total <= 0) return 'ещё без напитка';
  if (drinks_7d >= 6) return `${drinks_7d} за неделю`;
  if (drinks_7d >= 5) return '5 за неделю';
  if (habit) return 'ходит почти каждую неделю';
  if (total >= 100) return `${total} ${drinks_word(total)} всего`;
  if (total === 1) return 'один напиток';
  return `${total} ${drinks_word(total)}`;
}

/**
 * Номер растёт и от недели, и от стажа, и может уйти за 20.
 * 1 — один напиток. ~11 — воскресный ритм. 12 — пять за неделю.
 * 15 — шесть за неделю. 20 — сто напитков за всё время.
 */
function rank_of(total: number, drinks_7d: number, hot_weeks: number, weekday_habit: number): number {
  if (total <= 0) return 0;
  let rank = 1;
  if (total >= 2) rank = 2;
  if (total >= 3) rank = 3;
  if (total >= 5) rank = 4;
  if (total >= 8) rank = 5;
  if (hot_weeks >= 2 || weekday_habit >= 2) rank = Math.max(rank, 7);
  if (hot_weeks >= 3 || weekday_habit >= 3) rank = Math.max(rank, 11);
  if (drinks_7d >= 5) rank = Math.max(rank, 12);
  if (drinks_7d >= 6) rank = Math.max(rank, 15 + Math.min(5, drinks_7d - 6));
  if (total >= 40) rank = Math.max(rank, 16);
  if (total >= 70) rank = Math.max(rank, 18);
  if (total >= 100) rank = Math.max(rank, 20 + Math.floor((total - 100) / 25));
  return rank;
}

function ymd_span(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  if (!ay || !am || !ad || !by || !bm || !bd) return 0;
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

function visit_days(hits: drink_hit[]): string[] {
  const days: string[] = [];
  for (const hit of hits) {
    if (!hit.ymd || days[days.length - 1] === hit.ymd) continue;
    days.push(hit.ymd);
  }
  return days;
}

function fresh_of(rank: number, days_since: number | null): fresh_tone | null {
  if (rank > 3 || days_since == null || days_since < 1) return null;
  if (days_since <= 3) return 'hot';
  if (days_since <= 10) return 'nudge';
  return 'gone';
}

export function guest_level(orders: guest_rank_order[], now = new Date()): guest_level {
  const hits = drink_hits(orders);
  const total = hits.reduce((s, h) => s + h.qty, 0);
  if (total <= 0) {
    const kind = kind_of_rank(0);
    return {
      rank: 0,
      base_rank: 0,
      name: '0',
      kind: kind.id,
      type_name: kind.name,
      color: kind.color,
      weight: kind.weight,
      who: kind.who,
      hint: 'ещё без напитка',
      rush: false,
      cooling: false,
      days_since: null,
      fresh: null,
    };
  }

  const now_ms = now.getTime();
  const week_ago = now_ms - 7 * DAY_MS;
  const drinks_7d = hits.reduce((s, h) => (h.at >= week_ago ? s + h.qty : s), 0);

  const recent_mondays = new Set<string>();
  for (let i = 0; i < 4; i++) {
    recent_mondays.add(week_monday(msk_parts(new Date(now_ms - i * 7 * DAY_MS).toISOString()).ymd));
  }
  const drinks_by_week = new Map<string, number>();
  const weeks_by_weekday = new Map<number, Set<string>>();
  const habit_from = now_ms - 56 * DAY_MS;
  for (const hit of hits) {
    const monday = week_monday(hit.ymd);
    if (recent_mondays.has(monday)) {
      drinks_by_week.set(monday, (drinks_by_week.get(monday) || 0) + hit.qty);
    }
    if (hit.at >= habit_from) {
      const set = weeks_by_weekday.get(hit.weekday) || new Set<string>();
      set.add(monday);
      weeks_by_weekday.set(hit.weekday, set);
    }
  }
  let hot_weeks = 0;
  for (const qty of drinks_by_week.values()) {
    if (qty >= 2) hot_weeks += 1;
  }
  let weekday_habit = 0;
  for (const set of weeks_by_weekday.values()) {
    if (set.size > weekday_habit) weekday_habit = set.size;
  }

  const habit = hot_weeks >= 3 || weekday_habit >= 3;
  const base_rank = rank_of(total, drinks_7d, hot_weeks, weekday_habit);
  const today = msk_parts(now.toISOString()).ymd;
  const days = visit_days(hits);
  const last_day = days[days.length - 1] || '';
  const prev_day = days.length >= 2 ? days[days.length - 2] : '';
  const days_since = last_day ? ymd_span(last_day, today) : null;
  const gap = prev_day && last_day ? ymd_span(prev_day, last_day) : null;
  const rush = gap != null && gap >= 1 && gap <= 4 && days_since != null && days_since <= 7;
  const rank = base_rank + (rush ? 1 : 0);
  const cooling = rank >= 4 && days_since != null && days_since > 14;
  const fresh = fresh_of(rank, days_since);
  const kind = kind_of_rank(rank);
  const look = paint(rank);
  let hint = describe(total, drinks_7d, habit);
  if (rush) hint += ' · +1 на неделю, зашёл раньше 4 дней';
  if (cooling) hint += ' · больше 14 дней без визита';
  return {
    rank,
    base_rank,
    name: String(rank),
    kind: kind.id,
    type_name: kind.name,
    who: kind.who,
    ...look,
    hint,
    rush,
    cooling,
    days_since,
    fresh,
  };
}

export type return_window = {
  days: number;
  eligible: number;
  returned: number;
  /** null, пока в окне никого нет */
  rate: number | null;
};

export type guest_return = {
  /** первый напиток был не сегодня, и гость пришёл ещё раз когда угодно */
  after_first: return_window;
  within_7: return_window;
  /** вторая покупка в течение 30 дней после первой. в знаменателе только те, у кого эти 30 дней уже прошли */
  within_30: return_window;
};

export type return_order = guest_rank_order & {
  user_id?: string | null;
  customer_phone?: string | null;
  /** null — суммы в заказе не было, 0 — гость ничего не заплатил */
  total_price?: number | null;
  /** насколько первая цена ниже меню, ₽. 0 — скидки не видно */
  discount_rub?: number;
};

/** гость в возврате — только по номеру. без телефона его нельзя узнать в следующий раз, id кассы не считается */
function guest_key(order: return_order): string | null {
  const digits = (order.customer_phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  return null;
}

function window_rate(
  rows: { first: number; second: number | null }[],
  days: number,
  now: number,
  mode: 'later' | 'within'
): return_window {
  const span = days * DAY_MS;
  let eligible = 0;
  let returned = 0;
  for (const row of rows) {
    if (mode === 'later') {
      if (now - row.first < span) continue;
      eligible += 1;
      if (row.second != null) returned += 1;
      continue;
    }
    if (now - row.first < span) continue;
    eligible += 1;
    if (row.second != null && row.second - row.first <= span) returned += 1;
  }
  return {
    days,
    eligible,
    returned,
    rate: eligible > 0 ? Math.round((returned / eligible) * 100) : null,
  };
}

/** возвращаемость опознанных гостей после первого напитка */
export function guest_return(orders: return_order[], now = new Date()): guest_return {
  const by_guest = new Map<string, number[]>();
  for (const order of orders) {
    if (drink_qty(order) <= 0) continue;
    const key = guest_key(order);
    if (!key) continue;
    const at = new Date(order.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    const list = by_guest.get(key) || [];
    list.push(at);
    by_guest.set(key, list);
  }
  const rows: { first: number; second: number | null }[] = [];
  for (const times of by_guest.values()) {
    times.sort((a, b) => a - b);
    const unique: number[] = [];
    for (const t of times) {
      if (!unique.length || t - unique[unique.length - 1] > 1000) unique.push(t);
    }
    rows.push({ first: unique[0], second: unique[1] ?? null });
  }
  const now_ms = now.getTime();
  return {
    after_first: window_rate(rows, 1, now_ms, 'later'),
    within_7: window_rate(rows, 7, now_ms, 'within'),
    within_30: window_rate(rows, 30, now_ms, 'within'),
  };
}

export type retention_bucket = {
  id: string;
  label: string;
  people: number;
  /** null, пока базу не из кого собрать */
  pct: number | null;
};

export type retention_family = {
  id: string;
  /** категория с сайта */
  label: string;
  buyers: number;
  returned: number;
  rate: number | null;
  /** напитки первого визита внутри этой категории */
  drinks: string[];
};

export type retention_check = {
  people: number;
  avg_check: number | null;
  discounted: number;
  avg_discount: number | null;
};

export type retention_drink = {
  name: string;
  guests: number;
  cups: number;
};

export type visit_habit = {
  /** постоянные: уже были дважды и заходили в последние 30 дней */
  people: number;
  /** среднее число визитов за эти 30 дней */
  avg_per_month: number | null;
};

export type crm_churn = {
  contacts: number;
  silent_30: number;
  silent_45: number;
  rate_30: number | null;
  rate_45: number | null;
};

export type retention_report = guest_return & {
  /** закрытые окна: 3, 7, 14 и 30 дней после первой покупки */
  dropoff: return_window[];
  /** визиты за всё время среди тех, у кого 30 дней уже прошли */
  frequency: retention_bucket[];
  /** 3-й визит в течение 30 дней после 2-го, окно уже закрыто */
  to_third: return_window;
  /** 4-й визит в течение 30 дней после 3-го */
  to_fourth: return_window;
  habit: visit_habit;
  /** контакты с телефоном, которые не были 30 и 45 дней */
  churn: crm_churn;
  /** возврат за 30 дней по типу первого напитка, та же когорта */
  families: retention_family[];
  checks: { returned: retention_check; once: retention_check };
  /** дни до второй покупки у тех, кто успел за 30 дней */
  speed: { people: number; avg_days: number | null; median_days: number | null };
  first_drinks: { once: retention_drink[]; returned: retention_drink[] };
};

/** порядок категорий как в меню на сайте */
const SITE_CATEGORIES = [
  'тёплые напитки',
  'классика',
  'лимонады',
  'на фруктовом пюре',
  'молочные',
  'напиток месяца',
  'комбо',
];

function drink_label(name: string): string {
  return (name || '')
    .replace(/\d+\s*мл/gi, '')
    .replace(/холодн\w+|горяч\w+|со льдом/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function paid_sum(order: return_order): number {
  if (order.total_price != null) return Math.max(0, Number(order.total_price) || 0);
  let sum = 0;
  for (const item of order.items || []) {
    if (item.kind === 'staff') continue;
    sum += Math.max(0, Number((item as { price?: number }).price) || 0) * Math.max(0, Number(item.quantity) || 0);
  }
  return sum;
}

function median_of(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

function avg_of(nums: number[]): number | null {
  if (!nums.length) return null;
  const value = nums.reduce((s, n) => s + n, 0) / nums.length;
  return Math.round(value);
}

type guest_visit = {
  at: number;
  paid: number;
  discount: number;
  lines: { name: string; category?: string; qty: number }[];
};

function guest_visits(orders: return_order[]): Map<string, guest_visit[]> {
  const by_guest = new Map<string, guest_visit[]>();
  for (const order of orders) {
    if (drink_qty(order) <= 0) continue;
    const key = guest_key(order);
    if (!key) continue;
    const at = new Date(order.created_at).getTime();
    if (!Number.isFinite(at)) continue;
    const lines: guest_visit['lines'] = [];
    for (const item of order.items || []) {
      if (item.kind === 'staff') continue;
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (qty <= 0 || !item.name) continue;
      lines.push({ name: item.name, category: item.category, qty });
    }
    const list = by_guest.get(key) || [];
    list.push({
      at,
      paid: paid_sum(order),
      discount: Math.max(0, Number(order.discount_rub) || 0),
      lines,
    });
    by_guest.set(key, list);
  }
  for (const list of by_guest.values()) list.sort((a, b) => a.at - b.at);
  return by_guest;
}

function check_of(rows: { paid: number; discount: number }[]): retention_check {
  if (!rows.length) return { people: 0, avg_check: null, discounted: 0, avg_discount: null };
  const discounted = rows.filter((row) => row.discount > 0);
  return {
    people: rows.length,
    avg_check: avg_of(rows.map((row) => row.paid)),
    discounted: discounted.length,
    avg_discount: avg_of(rows.map((row) => row.discount)),
  };
}

function top_drinks(rows: guest_visit['lines'][][], limit = 3): retention_drink[] {
  const map = new Map<string, { guests: number; cups: number }>();
  for (const lines of rows) {
    const seen = new Set<string>();
    for (const line of lines) {
      const name = drink_label(line.name);
      if (!name) continue;
      const row = map.get(name) || { guests: 0, cups: 0 };
      row.cups += line.qty;
      if (!seen.has(name)) {
        row.guests += 1;
        seen.add(name);
      }
      map.set(name, row);
    }
  }
  return [...map.entries()]
    .map(([name, row]) => ({ name, guests: row.guests, cups: row.cups }))
    .sort((a, b) => b.guests - a.guests || b.cups - a.cups)
    .slice(0, limit);
}

function later_visit(lists: guest_visit[][], from_index: number, days: number, now: number): return_window {
  const span = days * DAY_MS;
  let eligible = 0;
  let returned = 0;
  for (const visits of lists) {
    const prev = visits[from_index];
    if (!prev || now - prev.at < span) continue;
    eligible += 1;
    const next = visits[from_index + 1];
    if (next && next.at - prev.at <= span) returned += 1;
  }
  return {
    days,
    eligible,
    returned,
    rate: eligible > 0 ? Math.round((returned / eligible) * 100) : null,
  };
}

function habit_of(lists: guest_visit[][], now: number): visit_habit {
  const span = 30 * DAY_MS;
  const counts: number[] = [];
  for (const visits of lists) {
    if (visits.length < 2) continue;
    const last = visits[visits.length - 1];
    if (!last || now - last.at > span) continue;
    counts.push(visits.filter((visit) => now - visit.at <= span).length);
  }
  if (!counts.length) return { people: 0, avg_per_month: null };
  const avg = counts.reduce((s, n) => s + n, 0) / counts.length;
  return { people: counts.length, avg_per_month: Math.round(avg * 10) / 10 };
}

function churn_of(keys: string[], guests: Map<string, guest_visit[]>, now: number): crm_churn {
  const unique = [...new Set(keys.filter(Boolean))];
  let silent_30 = 0;
  let silent_45 = 0;
  for (const key of unique) {
    const visits = guests.get(key);
    const last = visits?.length ? visits[visits.length - 1].at : null;
    if (last == null || now - last > 45 * DAY_MS) silent_45 += 1;
    if (last == null || now - last > 30 * DAY_MS) silent_30 += 1;
  }
  return {
    contacts: unique.length,
    silent_30,
    silent_45,
    rate_30: unique.length ? Math.round((silent_30 / unique.length) * 100) : null,
    rate_45: unique.length ? Math.round((silent_45 / unique.length) * 100) : null,
  };
}

/** разбор возвращаемости: скорость отвала, визиты, первый напиток, чек, срок до второй покупки */
export function retention_report(
  orders: return_order[],
  now = new Date(),
  contact_keys: string[] = []
): retention_report {
  const base = guest_return(orders, now);
  const now_ms = now.getTime();
  const guests = guest_visits(orders);
  const lists = [...guests.values()];
  const to_third = later_visit(lists, 1, 30, now_ms);
  const to_fourth = later_visit(lists, 2, 30, now_ms);
  const habit = habit_of(lists, now_ms);
  const churn = churn_of(contact_keys, guests, now_ms);
  const timelines: { first: number; second: number | null }[] = [];
  for (const visits of guests.values()) {
    const times = visits.map((visit) => visit.at);
    timelines.push({ first: times[0], second: times[1] ?? null });
  }
  const dropoff = [3, 7, 14, 30].map((days) => window_rate(timelines, days, now_ms, 'within'));

  const closed = [...guests.values()].filter((visits) => now_ms - visits[0].at >= 30 * DAY_MS);
  const frequency_defs = [
    { id: 'once', label: 'одноразовые', test: (n: number) => n === 1 },
    { id: 'try', label: 'пробующие', test: (n: number) => n === 2 },
    { id: 'regular', label: 'постоянные', test: (n: number) => n >= 3 && n <= 5 },
    { id: 'core', label: 'фанаты', test: (n: number) => n >= 6 },
  ];
  const frequency: retention_bucket[] = frequency_defs.map((def) => {
    const people = closed.filter((visits) => def.test(visits.length)).length;
    return {
      id: def.id,
      label: def.label,
      people,
      pct: closed.length ? Math.round((people / closed.length) * 100) : null,
    };
  });

  const returned_rows: guest_visit[] = [];
  const once_rows: guest_visit[] = [];
  const gaps: number[] = [];
  const family_map = new Map<string, { buyers: number; returned: number; drinks: Map<string, number> }>();
  for (const visits of closed) {
    const back = visits[1] != null && visits[1].at - visits[0].at <= 30 * DAY_MS;
    if (back && visits[1]) {
      returned_rows.push(visits[0]);
      gaps.push((visits[1].at - visits[0].at) / DAY_MS);
    } else once_rows.push(visits[0]);
    const seen_category = new Set<string>();
    const seen_drink = new Set<string>();
    for (const line of visits[0].lines) {
      const category = (line.category || '').trim();
      if (!category || !SITE_CATEGORIES.includes(category)) continue;
      const row = family_map.get(category) || { buyers: 0, returned: 0, drinks: new Map<string, number>() };
      if (!seen_category.has(category)) {
        seen_category.add(category);
        row.buyers += 1;
        if (back) row.returned += 1;
      }
      const drink = drink_label(line.name);
      const drink_key = `${category}\0${drink}`;
      if (drink && !seen_drink.has(drink_key)) {
        seen_drink.add(drink_key);
        row.drinks.set(drink, (row.drinks.get(drink) || 0) + 1);
      }
      family_map.set(category, row);
    }
  }
  const families: retention_family[] = [...family_map.entries()]
    .map(([category, row]) => ({
      id: category,
      label: category,
      buyers: row.buyers,
      returned: row.returned,
      rate: row.buyers ? Math.round((row.returned / row.buyers) * 100) : null,
      drinks: [...row.drinks.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([name]) => name),
    }))
    .sort((a, b) => {
      const ai = SITE_CATEGORIES.indexOf(a.label);
      const bi = SITE_CATEGORIES.indexOf(b.label);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  return {
    ...base,
    dropoff,
    frequency,
    to_third,
    to_fourth,
    habit,
    churn,
    families,
    checks: {
      returned: check_of(returned_rows.map((row) => ({ paid: row.paid, discount: row.discount }))),
      once: check_of(once_rows.map((row) => ({ paid: row.paid, discount: row.discount }))),
    },
    speed: {
      people: gaps.length,
      avg_days: gaps.length
        ? Math.round((gaps.reduce((s, n) => s + n, 0) / gaps.length) * 10) / 10
        : null,
      median_days: median_of(gaps),
    },
    first_drinks: {
      once: top_drinks(once_rows.map((row) => row.lines)),
      returned: top_drinks(returned_rows.map((row) => row.lines)),
    },
  };
}
