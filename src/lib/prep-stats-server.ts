import { read_durable_json, write_durable_json } from '@/lib/durable-json';
import { list_handed_rows } from '@/lib/handed-orders-server';
import { moscow_today_iso } from '@/lib/order-number';
import type {
  barista_analytics,
  drink_stat,
  fulfillment_event,
  order,
  prep_event,
} from '@/lib/types';

const prep_key = 'prep-events';
const fulfill_key = 'fulfillment-events';

export function classify_drink_pace(actual_ms: number, expected_ms: number): prep_event['drink_pace'] {
  if (expected_ms <= 0) return 'normal';
  const ratio = actual_ms / expected_ms;
  if (ratio <= 0.7) return 'fast';
  if (ratio >= 1.15) return 'slow';
  return 'normal';
}

export function classify_order_timing(
  finished_at_ms: number,
  pickup_at_ms: number
): fulfillment_event['timing'] {
  const early_ms = 3 * 60_000;
  if (finished_at_ms > pickup_at_ms) return 'overdue';
  if (finished_at_ms < pickup_at_ms - early_ms) return 'early';
  return 'on_time';
}

async function load_prep(): Promise<prep_event[]> {
  const raw = await read_durable_json<prep_event[]>(prep_key, []);
  return Array.isArray(raw) ? raw : [];
}

async function save_prep(all: prep_event[]) {
  await write_durable_json(prep_key, all);
}

async function load_fulfill(): Promise<fulfillment_event[]> {
  const raw = await read_durable_json<fulfillment_event[]>(fulfill_key, []);
  return Array.isArray(raw) ? raw : [];
}

async function save_fulfill(all: fulfillment_event[]) {
  await write_durable_json(fulfill_key, all);
}

export async function add_prep_event(
  event: Omit<prep_event, 'id' | 'drink_pace' | 'shift_date'> & {
    id?: string;
    drink_pace?: prep_event['drink_pace'];
    shift_date?: string;
  }
): Promise<prep_event> {
  const all = await load_prep();
  const record: prep_event = {
    ...event,
    id: event.id || `prep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    drink_pace:
      event.drink_pace || classify_drink_pace(event.actual_ms, event.expected_ms),
    shift_date: event.shift_date || moscow_today_iso(),
  };
  all.push(record);
  await save_prep(all);
  return record;
}

export async function add_fulfillment_event(
  event: Omit<fulfillment_event, 'id' | 'timing' | 'shift_date' | 'duration_ms'> & {
    id?: string;
    timing?: fulfillment_event['timing'];
    shift_date?: string;
    duration_ms?: number;
  }
): Promise<fulfillment_event> {
  const all = await load_fulfill();
  const started = new Date(event.started_at).getTime();
  const finished = new Date(event.finished_at).getTime();
  const pickup = new Date(event.pickup_at).getTime();
  const record: fulfillment_event = {
    ...event,
    id: event.id || `ful-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    duration_ms: event.duration_ms ?? Math.max(0, finished - started),
    timing: event.timing || classify_order_timing(finished, pickup),
    shift_date: event.shift_date || moscow_today_iso(),
  };
  all.push(record);
  await save_fulfill(all);
  return record;
}

export async function get_fulfillment_order_ids(input: {
  shift_date: string;
  seller_id?: string;
}): Promise<string[]> {
  const all = await load_fulfill();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const e of all) {
    if (e.shift_date !== input.shift_date) continue;
    if (input.seller_id && e.seller_id !== input.seller_id) continue;
    if (seen.has(e.order_id)) continue;
    seen.add(e.order_id);
    ids.push(e.order_id);
  }
  return ids;
}

function drinks_from_orders(orders: order[], times: Map<string, number[]>): drink_stat[] {
  const by_drink = new Map<string, { name: string; count: number; times: number[] }>();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (!item?.name) continue;
      const key = item.menu_id || item.name;
      const row = by_drink.get(key) || { name: item.name, count: 0, times: [] };
      row.name = item.name;
      row.count += Number(item.quantity) || 1;
      by_drink.set(key, row);
    }
  }
  for (const [key, samples] of times) {
    const row = by_drink.get(key);
    if (row) row.times.push(...samples);
  }
  return [...by_drink.entries()]
    .map(([menu_id, row]) => ({
      menu_id,
      name: row.name,
      count: row.count,
      avg_ms: row.times.length ? row.times.reduce((a, b) => a + b, 0) / row.times.length : 0,
      fastest_ms: row.times.length ? Math.min(...row.times) : 0,
      slowest_ms: row.times.length ? Math.max(...row.times) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

function drinks_from_prep(preps: prep_event[]): drink_stat[] {
  const by_drink = new Map<string, { name: string; times: number[] }>();
  for (const prep of preps) {
    const key = prep.menu_id || prep.drink_name;
    const row = by_drink.get(key) || { name: prep.drink_name, times: [] };
    row.name = prep.drink_name;
    row.times.push(prep.actual_ms);
    by_drink.set(key, row);
  }
  return [...by_drink.entries()]
    .map(([menu_id, row]) => {
      const sum = row.times.reduce((a, b) => a + b, 0);
      return {
        menu_id,
        name: row.name,
        count: row.times.length,
        avg_ms: sum / row.times.length,
        fastest_ms: Math.min(...row.times),
        slowest_ms: Math.max(...row.times),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

export async function get_barista_analytics(input: {
  shift_date: string;
  seller_id?: string;
}): Promise<barista_analytics> {
  const { shift_date, seller_id } = input;
  const handed = await list_handed_rows(seller_id);
  const day_orders = handed
    .filter((row) => row.shift_date === shift_date)
    .map((row) => row.order);
  const history_orders_list = handed.map((row) => row.order);
  const preps = (await load_prep()).filter((e) => {
    if (e.shift_date !== shift_date) return false;
    if (seller_id && e.seller_id !== seller_id) return false;
    return true;
  });
  const fulfills_raw = (await load_fulfill()).filter((e) => {
    if (e.shift_date !== shift_date) return false;
    if (seller_id && e.seller_id !== seller_id) return false;
    return true;
  });

  // одна выдача = один заказ (как во вкладке «готовые»)
  const by_order = new Map<string, (typeof fulfills_raw)[number]>();
  for (const f of fulfills_raw) {
    const prev = by_order.get(f.order_id);
    if (!prev || new Date(f.finished_at) > new Date(prev.finished_at)) {
      by_order.set(f.order_id, f);
    }
  }
  const fulfills = [...by_order.values()];

  const prep_times = new Map<string, number[]>();
  for (const prep of preps) {
    const key = prep.menu_id || prep.drink_name;
    const list = prep_times.get(key) || [];
    list.push(prep.actual_ms);
    prep_times.set(key, list);
  }
  const sold = drinks_from_orders(day_orders, prep_times);
  const drinks = sold.length > 0 ? sold : drinks_from_prep(preps);
  const history_drinks = drinks_from_orders(history_orders_list, new Map());

  const most_cooked = drinks[0] ?? null;
  const timed = drinks.filter((drink) => drink.avg_ms > 0);
  const fastest_drink =
    timed.length > 0
      ? [...timed].sort((a, b) => a.avg_ms - b.avg_ms || b.count - a.count)[0]
      : null;
  const slowest_drink =
    timed.length > 0
      ? [...timed].sort((a, b) => b.avg_ms - a.avg_ms || b.count - a.count)[0]
      : null;

  const avg_fulfillment_ms =
    fulfills.length > 0
      ? fulfills.reduce((s, f) => s + f.duration_ms, 0) / fulfills.length
      : null;

  return {
    shift_date,
    seller_id: seller_id ?? null,
    avg_fulfillment_ms,
    fulfillment_count: Math.max(fulfills.length, day_orders.length),
    early_count: fulfills.filter((f) => f.timing === 'early').length,
    on_time_count: fulfills.filter((f) => f.timing === 'on_time').length,
    overdue_count: fulfills.filter((f) => f.timing === 'overdue').length,
    drinks,
    most_cooked,
    fastest_drink,
    slowest_drink,
    prep_count: Math.max(preps.length, drinks.reduce((sum, drink) => sum + drink.count, 0)),
    history_orders: history_orders_list.length,
    history_drinks,
  };
}
