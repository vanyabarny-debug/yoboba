import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import type {
  barista_analytics,
  drink_stat,
  fulfillment_event,
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
  return read_json_store<prep_event[]>(prep_key, []);
}

async function load_fulfill(): Promise<fulfillment_event[]> {
  return read_json_store<fulfillment_event[]>(fulfill_key, []);
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
  await write_json_store(prep_key, all);
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
  await write_json_store(fulfill_key, all);
  return record;
}

export async function get_barista_analytics(input: {
  shift_date: string;
  seller_id?: string;
}): Promise<barista_analytics> {
  const { shift_date, seller_id } = input;
  const preps = (await load_prep()).filter((e) => {
    if (e.shift_date !== shift_date) return false;
    if (seller_id && e.seller_id !== seller_id) return false;
    return true;
  });
  const fulfills = (await load_fulfill()).filter((e) => {
    if (e.shift_date !== shift_date) return false;
    if (seller_id && e.seller_id !== seller_id) return false;
    return true;
  });

  const by_drink = new Map<string, { name: string; times: number[] }>();
  for (const p of preps) {
    const key = p.menu_id || p.drink_name;
    const row = by_drink.get(key) || { name: p.drink_name, times: [] };
    row.name = p.drink_name;
    row.times.push(p.actual_ms);
    by_drink.set(key, row);
  }

  const drinks: drink_stat[] = [...by_drink.entries()].map(([menu_id, row]) => {
    const sum = row.times.reduce((a, b) => a + b, 0);
    return {
      menu_id,
      name: row.name,
      count: row.times.length,
      avg_ms: sum / row.times.length,
      fastest_ms: Math.min(...row.times),
      slowest_ms: Math.max(...row.times),
    };
  });

  drinks.sort((a, b) => b.count - a.count);

  const most_cooked = drinks[0] ?? null;
  const fastest_drink =
    drinks.length > 0
      ? [...drinks].sort((a, b) => a.avg_ms - b.avg_ms || b.count - a.count)[0]
      : null;
  const slowest_drink =
    drinks.length > 0
      ? [...drinks].sort((a, b) => b.avg_ms - a.avg_ms || b.count - a.count)[0]
      : null;

  const avg_fulfillment_ms =
    fulfills.length > 0
      ? fulfills.reduce((s, f) => s + f.duration_ms, 0) / fulfills.length
      : null;

  return {
    shift_date,
    seller_id: seller_id ?? null,
    avg_fulfillment_ms,
    fulfillment_count: fulfills.length,
    early_count: fulfills.filter((f) => f.timing === 'early').length,
    on_time_count: fulfills.filter((f) => f.timing === 'on_time').length,
    overdue_count: fulfills.filter((f) => f.timing === 'overdue').length,
    drinks,
    most_cooked,
    fastest_drink,
    slowest_drink,
    prep_count: preps.length,
  };
}
