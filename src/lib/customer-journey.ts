import { normalize_order_item_fields } from '@/lib/order-item-name';

export type journey_order = {
  created_at: string;
  status: string;
  items: { name: string; quantity: number; volume?: string; kind?: 'sale' | 'staff' }[];
};

const DAY = 86_400_000;

function visits_of(orders: journey_order[]) {
  return orders
    .filter((o) => o.status !== 'cancelled' && o.items.some((i) => i.kind !== 'staff'))
    .map((o) => ({
      t: new Date(o.created_at).getTime(),
      names: [
        ...new Set(
          o.items
            .filter((i) => i.kind !== 'staff')
            .map((i) => normalize_order_item_fields({ name: i.name, volume: i.volume }).name.trim())
            .filter(Boolean)
        ),
      ],
    }))
    .filter((v) => Number.isFinite(v.t))
    .sort((a, b) => a.t - b.t);
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type customer_journey = {
  visits: number;
  first_at: string | null;
  first_items: string[];
  second_items: string[];
  returned: boolean;
  days_to_second: number | null;
  avg_gap: number | null;
  days_since_last: number | null;
  /** что берёт снова и снова: позиция, купленная в большем числе визитов (≥2) */
  repeat_favorite: { name: string; visits: number } | null;
  /** пора напомнить: не был дольше двух своих обычных интервалов */
  overdue: boolean;
};

export function customer_journey(orders: journey_order[], now = Date.now()): customer_journey {
  const v = visits_of(orders);
  if (!v.length) {
    return {
      visits: 0,
      first_at: null,
      first_items: [],
      second_items: [],
      returned: false,
      days_to_second: null,
      avg_gap: null,
      days_since_last: null,
      repeat_favorite: null,
      overdue: false,
    };
  }
  const gaps = v.slice(1).map((x, i) => (x.t - v[i].t) / DAY);
  const per_item = new Map<string, number>();
  for (const x of v) for (const n of x.names) per_item.set(n, (per_item.get(n) || 0) + 1);
  const fav = [...per_item.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
  const avg_gap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;
  const since = (now - v[v.length - 1].t) / DAY;
  return {
    visits: v.length,
    first_at: new Date(v[0].t).toISOString(),
    first_items: v[0].names,
    second_items: v[1]?.names ?? [],
    returned: v.length >= 2,
    days_to_second: gaps.length ? Math.round(gaps[0] * 10) / 10 : null,
    avg_gap: avg_gap == null ? null : Math.round(avg_gap * 10) / 10,
    days_since_last: Math.floor(since),
    repeat_favorite: fav ? { name: fav[0], visits: fav[1] } : null,
    overdue: avg_gap != null && since > Math.max(14, avg_gap * 2),
  };
}

export type journey_item_row = {
  name: string;
  /** у скольких гостей это была первая покупка */
  first: number;
  /** из них вернулись */
  first_returned: number;
  /** сколько гостей вообще брали */
  buyers: number;
  /** брали в двух и более визитах */
  rebuyers: number;
  /** взяли во второй визит */
  as_second: number;
};

export type journey_report = {
  guests: number;
  returned: number;
  return_rate: number;
  median_days_to_second: number | null;
  /** через сколько дней пришли второй раз */
  second_buckets: { label: string; count: number }[];
  /** во второй визит взяли то же, что в первый */
  same_second_share: number;
  items: journey_item_row[];
  transitions: { from: string; to: string; count: number }[];
  overdue: number;
  one_and_done_recent: number;
};

const buckets: { label: string; max: number }[] = [
  { label: 'в тот же день', max: 1 },
  { label: '2–3 дня', max: 3 },
  { label: '4–7 дней', max: 7 },
  { label: '8–14 дней', max: 14 },
  { label: '15–30 дней', max: 30 },
  { label: 'позже', max: Infinity },
];

export function journey_report(customers: { orders: journey_order[] }[], now = Date.now()): journey_report {
  const items = new Map<string, journey_item_row>();
  const row = (name: string) => {
    let r = items.get(name);
    if (!r) {
      r = { name, first: 0, first_returned: 0, buyers: 0, rebuyers: 0, as_second: 0 };
      items.set(name, r);
    }
    return r;
  };
  const trans = new Map<string, { from: string; to: string; count: number }>();
  const to_second: number[] = [];
  const bucket_counts = buckets.map(() => 0);
  let guests = 0;
  let returned = 0;
  let same = 0;
  let overdue = 0;
  let one_and_done_recent = 0;

  for (const c of customers) {
    const v = visits_of(c.orders);
    if (!v.length) continue;
    guests += 1;
    const back = v.length >= 2;
    if (back) returned += 1;
    for (const n of v[0].names) {
      const r = row(n);
      r.first += 1;
      if (back) r.first_returned += 1;
    }
    const per_item = new Map<string, number>();
    for (const x of v) for (const n of x.names) per_item.set(n, (per_item.get(n) || 0) + 1);
    for (const [n, k] of per_item) {
      const r = row(n);
      r.buyers += 1;
      if (k >= 2) r.rebuyers += 1;
    }
    if (back) {
      const days = (v[1].t - v[0].t) / DAY;
      to_second.push(days);
      bucket_counts[buckets.findIndex((b) => days <= b.max)] += 1;
      for (const n of v[1].names) row(n).as_second += 1;
      if (v[1].names.some((n) => v[0].names.includes(n))) same += 1;
      for (const a of v[0].names) {
        for (const b of v[1].names) {
          const key = `${a}→${b}`;
          const t = trans.get(key) || { from: a, to: b, count: 0 };
          t.count += 1;
          trans.set(key, t);
        }
      }
      if (customer_journey(c.orders, now).overdue) overdue += 1;
    } else if ((now - v[0].t) / DAY <= 30) {
      one_and_done_recent += 1;
    }
  }

  const med = median(to_second);
  return {
    guests,
    returned,
    return_rate: guests ? returned / guests : 0,
    median_days_to_second: med == null ? null : Math.round(med * 10) / 10,
    second_buckets: buckets.map((b, i) => ({ label: b.label, count: bucket_counts[i] })),
    same_second_share: returned ? same / returned : 0,
    items: [...items.values()].sort((a, b) => b.rebuyers - a.rebuyers || b.buyers - a.buyers),
    transitions: [...trans.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    overdue,
    one_and_done_recent,
  };
}
