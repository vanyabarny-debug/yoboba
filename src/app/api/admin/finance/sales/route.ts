import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import { get_demo_orders } from '@/lib/demo-orders-server';
import { read_finance_state } from '@/lib/finance/finance-server';
import { read_published_menu } from '@/lib/menu-catalog-server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { each_day, menu_price_for_size, type sales_cell } from '@/lib/finance/model';
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

/**
 * фактические продажи за месяц из заказов (сайт + касса),
 * разложенные по техкартам и размерам.
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

  let orders: order[] = [];
  if (is_supabase_configured()) {
    const supabase = create_service_client();
    const { data, error } = await supabase
      .from('orders')
      .select('id, items, status, created_at, total_price')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .neq('status', 'cancelled');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    orders = (data as order[]) || [];
  }
  for (const o of await get_demo_orders(false)) {
    const t = new Date(o.created_at);
    if (t >= start && t < end && o.status !== 'cancelled') orders.push(o);
  }

  const [state, stored_menu] = await Promise.all([read_finance_state(), read_published_menu()]);
  const menu: menu_item[] =
    stored_menu && stored_menu.version >= store_version && stored_menu.items?.length
      ? merge_menu_item_catalog(stored_menu.items)
      : get_default_store().items;
  const menu_by_id = new Map(menu.map((m) => [m.id, m]));
  const card_by_menu = new Map(
    state.techCards.filter((c) => c.menu_item_id).map((c) => [c.menu_item_id as string, c])
  );

  const sums: Record<string, Record<string, { revenue: number; qty: number }>> = {};
  const unmatched = new Map<string, unmatched_row>();
  const day_map = new Map<string, { revenue: number; orders: number }>();
  let orders_count = 0;
  let revenue_total = 0;

  for (const o of orders) {
    orders_count += 1;
    const rev = Number(o.total_price) || 0;
    revenue_total += rev;
    const ymd = moscow_ymd(new Date(o.created_at));
    const bucket = day_map.get(ymd) ?? { revenue: 0, orders: 0 };
    bucket.revenue += rev;
    bucket.orders += 1;
    day_map.set(ymd, bucket);
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
          // без объёма в названии — берём размер, чья цена по меню ближе всего к цене строки
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
    return { day: d, revenue: Math.round(row?.revenue ?? 0), orders: row?.orders ?? 0 };
  });

  return NextResponse.json(
    {
      month,
      from,
      to,
      orders: orders_count,
      revenue: Math.round(revenue_total),
      sales,
      by_day,
      unmatched: [...unmatched.values()].sort((a, b) => b.qty - a.qty),
    },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
