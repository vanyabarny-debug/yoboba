import type { menu_item, order, order_item } from '@/lib/types';

export const DEFAULT_PREP_MINUTES = 2;
export const MAX_START_BEFORE_PICKUP_MIN = 10;
export const MAX_COUNTER_BEFORE_PICKUP_MIN = 6;
export const BARISTA_COUNT = 1;
export const SLOT_STEP_MIN = 5;
export const MAX_SLOTS_AHEAD_MIN = 180;

export type kitchen_line = {
  order_id: string;
  menu_id: string;
  name: string;
  category: string;
  prep_minutes: number;
  pickup_at: number;
  priority: number;
  start_at: number;
  end_at: number;
  line_index: number;
};

export type pickup_slot = {
  at: string;
  label: string;
  is_asap: boolean;
  wait_minutes: number;
};

type interval = { start: number; end: number };

export function prep_minutes_for_item(
  item: Pick<menu_item, 'prep_minutes' | 'category'> | undefined,
  menu_id?: string
): number {
  const raw = item?.prep_minutes;
  if (typeof raw === 'number' && raw > 0) return Math.round(raw);
  return DEFAULT_PREP_MINUTES;
}

/** выше = готовить ближе к выдаче (газировка позже, тоники раньше) */
export function category_prep_priority(category: string): number {
  const c = category.toLowerCase();
  if (c.includes('газирован')) return 95;
  if (c.includes('фраппе')) return 80;
  if (c.includes('комбо')) return 70;
  if (c.includes('десерт') || c.includes('закуск')) return 65;
  if (c.includes('матча')) return 55;
  if (c.includes('джусбол')) return 45;
  if (c.includes('пп')) return 40;
  if (c.includes('классическ')) return 30;
  if (c.includes('тоник')) return 15;
  return 50;
}

function overlaps(a: interval, b: interval) {
  return a.start < b.end && b.start < a.end;
}

function fits_timeline(timeline: interval[], start: number, end: number) {
  const slot = { start, end };
  return !timeline.some((t) => overlaps(t, slot));
}

function insert_timeline(timeline: interval[], start: number, end: number) {
  timeline.push({ start, end });
  timeline.sort((a, b) => a.start - b.start);
}

function expand_order_lines(
  order_row: order,
  menu_by_id: Map<string, menu_item>
): Omit<kitchen_line, 'start_at' | 'end_at' | 'line_index'>[] {
  const pickup_at = new Date(order_row.pickup_time).getTime();
  const lines: Omit<kitchen_line, 'start_at' | 'end_at' | 'line_index'>[] = [];

  for (const row of order_row.items as order_item[]) {
    const menu = menu_by_id.get(row.menu_id);
    const category = menu?.category || 'напитки';
    for (let q = 0; q < row.quantity; q++) {
      lines.push({
        order_id: order_row.id,
        menu_id: row.menu_id,
        name: row.name,
        category,
        prep_minutes: prep_minutes_for_item(menu, row.menu_id),
        pickup_at,
        priority: category_prep_priority(category),
      });
    }
  }
  return lines;
}

function schedule_line(
  line: Omit<kitchen_line, 'start_at' | 'end_at' | 'line_index'>,
  timeline: interval[],
  now: number
): kitchen_line | null {
  const prep_ms = line.prep_minutes * 60_000;
  const pickup = line.pickup_at;
  const earliest_start = pickup - MAX_START_BEFORE_PICKUP_MIN * 60_000;
  const earliest_ready = pickup - MAX_COUNTER_BEFORE_PICKUP_MIN * 60_000;

  const candidates: number[] = [];
  for (let end = pickup; end >= earliest_ready; end -= 30_000) {
    const start = end - prep_ms;
    if (start < earliest_start) break;
    if (start < now) continue;
    candidates.push(start);
  }
  for (let start = Math.max(now, earliest_start); start + prep_ms <= pickup; start += 30_000) {
    candidates.push(start);
  }

  const unique = [...new Set(candidates)].sort((a, b) => a - b);

  for (const start of unique) {
    const end = start + prep_ms;
    if (end > pickup) continue;
    if (end < earliest_ready) continue;
    if (start < earliest_start) continue;
    if (!fits_timeline(timeline, start, end)) continue;
    insert_timeline(timeline, start, end);
    return { ...line, start_at: start, end_at: end, line_index: 0 };
  }

  return null;
}

export function build_kitchen_schedule(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines?: { menu_id: string; name: string; quantity: number }[];
  pickup_at?: number;
  now?: number;
}): { lines: kitchen_line[]; feasible: boolean } {
  const now = input.now ?? Date.now();
  const timeline: interval[] = [];
  const pending: Omit<kitchen_line, 'start_at' | 'end_at' | 'line_index'>[] = [];

  const active = input.active_orders.filter((o) =>
    ['new', 'preparing', 'ready'].includes(o.status)
  );

  for (const o of active) {
    pending.push(...expand_order_lines(o, input.menu_by_id));
  }

  if (input.cart_lines?.length && input.pickup_at) {
    for (const row of input.cart_lines) {
      const menu = input.menu_by_id.get(row.menu_id);
      const category = menu?.category || 'напитки';
      for (let q = 0; q < row.quantity; q++) {
        pending.push({
          order_id: '__draft__',
          menu_id: row.menu_id,
          name: row.name,
          category,
          prep_minutes: prep_minutes_for_item(menu, row.menu_id),
          pickup_at: input.pickup_at,
          priority: category_prep_priority(category),
        });
      }
    }
  }

  pending.sort((a, b) => {
    if (a.pickup_at !== b.pickup_at) return a.pickup_at - b.pickup_at;
    return b.priority - a.priority;
  });

  const lines: kitchen_line[] = [];
  let idx = 0;
  for (const line of pending) {
    const scheduled = schedule_line(line, timeline, now);
    if (!scheduled) {
      return { lines, feasible: false };
    }
    lines.push({ ...scheduled, line_index: idx++ });
  }

  return { lines, feasible: true };
}

export function min_feasible_pickup_ms(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines: { menu_id: string; name: string; quantity: number }[];
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const total_prep = input.cart_lines.reduce((sum, row) => {
    const menu = input.menu_by_id.get(row.menu_id);
    return sum + prep_minutes_for_item(menu, row.menu_id) * row.quantity;
  }, 0);

  const active = input.active_orders.filter((o) =>
    ['new', 'preparing', 'ready'].includes(o.status)
  );
  const queued_prep = active.reduce((sum, o) => {
    return (
      sum +
      (o.items as order_item[]).reduce((s, item) => {
        const menu = input.menu_by_id.get(item.menu_id);
        return s + prep_minutes_for_item(menu, item.menu_id) * item.quantity;
      }, 0)
    );
  }, 0);

  const wait = Math.ceil((queued_prep + total_prep) / BARISTA_COUNT);
  return now + Math.max(total_prep, wait) * 60_000;
}

export function suggest_pickup_slots(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines: { menu_id: string; name: string; quantity: number }[];
  now?: number;
  limit?: number;
}): pickup_slot[] {
  const now = input.now ?? Date.now();
  const limit = input.limit ?? 8;
  const slots: pickup_slot[] = [];

  const asap_at = min_feasible_pickup_ms(input);
  const asap_date = new Date(asap_at);
  slots.push({
    at: asap_date.toISOString(),
    label: format_slot_label(asap_date),
    is_asap: true,
    wait_minutes: Math.max(1, Math.ceil((asap_at - now) / 60_000)),
  });

  const step = SLOT_STEP_MIN * 60_000;
  let cursor = Math.ceil(asap_at / step) * step;
  const max_at = now + MAX_SLOTS_AHEAD_MIN * 60_000;

  while (slots.length < limit && cursor <= max_at) {
    const { feasible } = build_kitchen_schedule({
      active_orders: input.active_orders,
      menu_by_id: input.menu_by_id,
      cart_lines: input.cart_lines,
      pickup_at: cursor,
      now,
    });
    if (feasible) {
      const d = new Date(cursor);
      if (!slots.some((s) => s.at === d.toISOString())) {
        slots.push({
          at: d.toISOString(),
          label: format_slot_label(d),
          is_asap: false,
          wait_minutes: Math.ceil((cursor - now) / 60_000),
        });
      }
    }
    cursor += step;
  }

  return slots.slice(0, limit);
}

export function format_slot_label(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function lines_for_order(lines: kitchen_line[], order_id: string) {
  return lines.filter((l) => l.order_id === order_id);
}

export function order_queue_meta(
  lines: kitchen_line[],
  order_id: string,
  now = Date.now()
) {
  const mine = lines_for_order(lines, order_id);
  if (!mine.length) return null;
  const next = mine.find((l) => l.end_at > now) || mine[mine.length - 1];
  const starts_in = Math.max(0, Math.ceil((next.start_at - now) / 60_000));
  const ready_in = Math.max(0, Math.ceil((next.end_at - now) / 60_000));
  return {
    lines: mine,
    starts_in_min: starts_in,
    ready_in_min: ready_in,
    pickup_at: next.pickup_at,
  };
}

export function ms_until(ts: number, now = Date.now()) {
  return Math.max(0, ts - now);
}

export function format_countdown_ms(ms: number) {
  const total_sec = Math.ceil(ms / 1000);
  const m = Math.floor(total_sec / 60);
  const s = total_sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
