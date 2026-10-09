import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { read_finance_state } from '@/lib/finance/finance-server';
import { read_published_menu } from '@/lib/menu-catalog-server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { compute_store_rhythm } from '@/lib/customer-analytics';
import { count_order_cups } from '@/lib/combo';
import { each_day, menu_price_for_size, type sales_cell } from '@/lib/finance/model';
import { get_transactions } from '@/lib/cash-server';
import { read_active_spots, read_spots } from '@/lib/spots-server';
import { spot_display } from '@/lib/spot-store';
import type { menu_item, order, order_item } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

function parse_period(url: URL) {
  const from_q = url.searchParams.get('from') ?? '';
  const to_q = url.searchParams.get('to') ?? '';
  const month = url.searchParams.get('month') ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(from_q) && /^\d{4}-\d{2}-\d{2}$/.test(to_q)) {
    const from = from_q <= to_q ? from_q : to_q;
    const to = from_q <= to_q ? to_q : from_q;
    const start = new Date(`${from}T00:00:00+03:00`);
    const end = new Date(`${to}T00:00:00+03:00`);
    end.setDate(end.getDate() + 1);
    return { start, end, from, to, month: to.slice(0, 7) };
  }
  if (/^\d{4}-\d{2}$/.test(month)) {
    const { start, end } = month_range(month);
    const today = moscow_ymd(new Date());
    const days_in = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
    const last = today.startsWith(month)
      ? `${month}-${String(Math.min(days_in, Number(today.slice(8)))).padStart(2, '0')}`
      : `${month}-${String(days_in).padStart(2, '0')}`;
    return { start, end, from: `${month}-01`, to: last, month };
  }
  return null;
}

function month_range(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00+03:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const end = new Date(`${next}-01T00:00:00+03:00`);
  return { start, end, year: y, month: m };
}

function moscow_ymd(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${mo}-${day}`;
}

type unmatched_row = { menu_id: string; name: string; qty: number; revenue: number };

type tagged_order = order & { spot_id?: string | null };

/** карта order_id → spot_id из кассы (для старых заказов без колонки) */
async function cash_spot_by_order(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const txs = await get_transactions({});
    for (const t of txs) {
      if (!t.order_id || !t.spot_id) continue;
      if (!map.has(t.order_id)) map.set(t.order_id, t.spot_id);
    }
  } catch {
    /* касса недоступна — ок */
  }
  return map;
}

function resolve_order_spot(
  o: tagged_order,
  cash_map: Map<string, string>,
  fallback_spot_id: string | null
): string | null {
  const direct = (o.spot_id || '').trim();
  if (direct) return direct;
  const from_cash = cash_map.get(o.id);
  if (from_cash) return from_cash;
  return fallback_spot_id;
}

/**
 * фактические продажи за период из заказов (сайт + касса),
 * разложенные по техкартам и размерам.
 * ?spot_id=xxx — одна точка; без параметра / all — все (сумма + среднее).
 */
export async function GET(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const url = new URL(request.url);
  const period = parse_period(url);
  if (!period) {
    return NextResponse.json({ error: 'укажите from и to (YYYY-MM-DD) или месяц YYYY-MM' }, { status: 400 });
  }
  const { start, end, from, to, month } = period;
  const spot_q = (url.searchParams.get('spot_id') || '').trim();
  const spot_filter = spot_q && spot_q !== 'all' ? spot_q : '';

  const [spots, active_spots, cash_map] = await Promise.all([
    read_spots(),
    read_active_spots(),
    cash_spot_by_order(),
  ]);
  /** одна активная точка → старые заказы без тега считаем её */
  const fallback_spot_id = active_spots.length === 1 ? active_spots[0].id : null;
  const spots_count = Math.max(1, active_spots.length);

  let orders: tagged_order[] = [];
  if (is_supabase_configured()) {
    const supabase = create_service_client();
    let query = supabase
      .from('orders')
      .select('id, items, status, created_at, total_price, spot_id')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .neq('status', 'cancelled');
    const { data, error } = await query;
    if (error) {
      // колонки spot_id ещё нет — откат без неё
      if (/spot_id/i.test(error.message)) {
        const retry = await supabase
          .from('orders')
          .select('id, items, status, created_at, total_price')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .neq('status', 'cancelled');
        if (retry.error) {
          return NextResponse.json({ error: retry.error.message }, { status: 500 });
        }
        orders = (retry.data as tagged_order[]) || [];
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      orders = (data as tagged_order[]) || [];
    }
  }
  for (const o of await get_demo_orders(false)) {
    const t = new Date(o.created_at);
    if (t >= start && t < end && o.status !== 'cancelled') orders.push(o as tagged_order);
  }

  const tagged = orders.map((o) => ({
    ...o,
    spot_id: resolve_order_spot(o, cash_map, fallback_spot_id),
  }));

  const scoped = spot_filter
    ? tagged.filter((o) => o.spot_id === spot_filter)
    : tagged;

  const [state, stored_menu] = await Promise.all([read_finance_state(), read_published_menu()]);
  const menu: menu_item[] =
    stored_menu && stored_menu.version >= store_version && stored_menu.items?.length
      ? merge_menu_item_catalog(stored_menu.items, stored_menu.removed_item_ids ?? [])
      : get_default_store().items;
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  const card_by_menu = new Map(
    state.techCards.filter((c) => c.menu_item_id).map((c) => [c.menu_item_id as string, c])
  );

  const sums: Record<string, Record<string, { revenue: number; qty: number }>> = {};
  const unmatched = new Map<string, unmatched_row>();
  const day_map = new Map<string, { revenue: number; orders: number; cups: number }>();
  const per_spot = new Map<string, { revenue: number; orders: number }>();
  let orders_count = 0;
  let revenue_total = 0;
  let cups_total = 0;

  for (const o of scoped) {
    orders_count += 1;
    const rev = Number(o.total_price) || 0;
    revenue_total += rev;
    const cups = count_order_cups((o.items as order_item[]) ?? [], menu);
    cups_total += cups;
    const ymd = moscow_ymd(new Date(o.created_at));
    const bucket = day_map.get(ymd) ?? { revenue: 0, orders: 0, cups: 0 };
    bucket.revenue += rev;
    bucket.orders += 1;
    bucket.cups += cups;
    day_map.set(ymd, bucket);

    const sid = o.spot_id || '_unknown';
    const spot_bucket = per_spot.get(sid) ?? { revenue: 0, orders: 0 };
    spot_bucket.revenue += rev;
    spot_bucket.orders += 1;
    per_spot.set(sid, spot_bucket);

    for (const raw of (o.items as order_item[]) ?? []) {
      const qty = Number(raw.quantity) || 0;
      if (qty <= 0) continue;
      if ((raw as { kind?: string }).kind === 'staff') continue;
      const price = Number(raw.price) || 0;
      const card = card_by_menu.get(raw.menu_id);
      if (!card) {
        const key = raw.menu_id || raw.name;
        const prev = unmatched.get(key) ?? { menu_id: raw.menu_id, name: raw.name, qty: 0, revenue: 0 };
        prev.qty += qty;
        prev.revenue += price * qty;
        unmatched.set(key, prev);
        continue;
      }
      const size_keys = Object.keys(card.sizes);
      let size = size_keys[0] ?? '1';
      const vol =
        (typeof (raw as { volume?: string }).volume === 'string' && (raw as { volume: string }).volume) ||
        /(\d{3})\s*мл/i.exec(raw.name)?.[1];
      if (vol && card.sizes[vol]) {
        size = vol;
      } else if (size_keys.length > 1) {
        const item = menu_by_id.get(raw.menu_id);
        if (item) {
          let best = size;
          let best_diff = Infinity;
          for (const k of size_keys) {
            const diff = Math.abs(menu_price_for_size(item, k) - price);
            if (diff < best_diff) {
              best = k;
              best_diff = diff;
            }
          }
          size = best;
        }
      }
      if (!sums[card.id]) sums[card.id] = {};
      const cell = sums[card.id][size] ?? { revenue: 0, qty: 0 };
      cell.revenue += price * qty;
      cell.qty += qty;
      sums[card.id][size] = cell;
    }
  }

  const sales: Record<string, Record<string, sales_cell>> = {};
  for (const [tc, by_size] of Object.entries(sums)) {
    sales[tc] = {};
    for (const [size, cell] of Object.entries(by_size)) {
      sales[tc][size] = { qty: cell.qty, price: cell.qty ? Math.round(cell.revenue / cell.qty) : 0 };
    }
  }

  const by_day = each_day(from, to).map((d) => {
    const row = day_map.get(d);
    return {
      day: d,
      revenue: Math.round(row?.revenue ?? 0),
      orders: row?.orders ?? 0,
      cups: row?.cups ?? 0,
    };
  });

  const rhythm = compute_store_rhythm(
    scoped.map((o) => ({ created_at: o.created_at, total_price: Number(o.total_price) || 0 })),
    from,
    to
  );

  const spot_meta = spots.map((s) => ({
    id: s.id,
    label: spot_display(s) || s.id,
    city: s.city,
    address: s.address,
    is_active: s.is_active !== false,
  }));

  const by_spot = [...per_spot.entries()]
    .map(([id, row]) => {
      const meta = spot_meta.find((s) => s.id === id);
      return {
        spot_id: id === '_unknown' ? null : id,
        label: meta?.label || (id === '_unknown' ? 'без точки' : id),
        revenue: Math.round(row.revenue),
        orders: row.orders,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const avg_divisor = spot_filter ? 1 : spots_count;
  const avg_revenue = Math.round(revenue_total / avg_divisor);
  const avg_orders = Math.round((orders_count / avg_divisor) * 10) / 10;

  const selected = spot_filter ? spot_meta.find((s) => s.id === spot_filter) : null;

  return NextResponse.json(
    {
      month,
      from,
      to,
      spot_id: spot_filter || null,
      spot_label: selected?.label || (spot_filter ? spot_filter : 'все точки'),
      spots_count,
      spots: spot_meta,
      orders: orders_count,
      revenue: Math.round(revenue_total),
      /** стаканы с разворотом комбо (не «1 комбо = 1 шт») */
      cups: cups_total,
      /** при «все» — среднее на точку; при одной — то же что revenue */
      avg_revenue_per_spot: avg_revenue,
      avg_orders_per_spot: avg_orders,
      by_spot,
      sales,
      by_day,
      rhythm,
      unmatched: [...unmatched.values()].sort((a, b) => b.qty - a.qty),
    },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
