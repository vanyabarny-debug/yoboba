import type { menu_item, order, order_item } from '@/lib/types';

export const DEFAULT_PREP_MINUTES = 2;
export const MAX_START_BEFORE_PICKUP_MIN = 10;
export const MAX_COUNTER_BEFORE_PICKUP_MIN = 6;
export const BARISTA_COUNT = 1;
export const SLOT_STEP_MIN = 5;
export const MAX_SLOTS_AHEAD_MIN = 120;
export const SLOT_LIMIT = 12;

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
  item: Pick<menu_item, 'prep_minutes' | 'category'> | undefined
): number {
  const raw = item?.prep_minutes;
  if (typeof raw === 'number' && raw > 0) return Math.round(raw);
  return DEFAULT_PREP_MINUTES;
}

/** выше = готовить ближе к выдаче */
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
  return !timeline.some((t) => overlaps(t, { start, end }));
}

function insert_timeline(timeline: interval[], start: number, end: number) {
  timeline.push({ start, end });
  timeline.sort((a, b) => a.start - b.start);
}

function round_up_to_step(ms: number, step_ms: number) {
  return Math.ceil(ms / step_ms) * step_ms;
}

function cart_prep_minutes(
  cart_lines: { menu_id: string; quantity: number }[],
  menu_by_id: Map<string, menu_item>
) {
  return cart_lines.reduce((sum, row) => {
    const menu = menu_by_id.get(row.menu_id);
    return sum + prep_minutes_for_item(menu) * row.quantity;
  }, 0);
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
        prep_minutes: prep_minutes_for_item(menu),
        pickup_at,
        priority: category_prep_priority(category),
      });
    }
  }
  return lines;
}

/**
 * Ставит напиток в таймлайн бариста.
 * Окна 10/6 мин — мягкие: если asap-выдача близко, разрешаем раньше закончить.
 */
function schedule_line(
  line: Omit<kitchen_line, 'start_at' | 'end_at' | 'line_index'>,
  timeline: interval[],
  now: number,
  soft = false
): kitchen_line | null {
  const prep_ms = Math.max(60_000, line.prep_minutes * 60_000);
  const pickup = line.pickup_at;

  if (pickup <= now + 30_000) {
    if (!soft) return null;
  }

  const earliest_start = pickup - MAX_START_BEFORE_PICKUP_MIN * 60_000;
  const ideal_earliest_ready = pickup - MAX_COUNTER_BEFORE_PICKUP_MIN * 60_000;

  // ищем слот: закончить как можно ближе к выдаче, но не раньше чем (pickup - 6м), если хватает времени
  const candidates: number[] = [];
  const search_from = Math.max(now, earliest_start);
  const latest_start = pickup - prep_ms;

  if (latest_start < search_from && !soft) {
    return null;
  }

  for (let start = Math.max(search_from, latest_start); start >= search_from; start -= 30_000) {
    candidates.push(start);
    if (candidates.length > 40) break;
  }
  for (let start = search_from; start <= latest_start; start += 30_000) {
    candidates.push(start);
    if (candidates.length > 80) break;
  }

  const unique = [...new Set(candidates)].sort((a, b) => b - a);

  for (const start of unique) {
    const end = start + prep_ms;
    if (end > pickup + 60_000) continue;
    if (start < now - 5_000) continue;
    if (!soft && start < earliest_start - 60_000) continue;
    if (!soft && end < ideal_earliest_ready - 60_000 && pickup - now > MAX_COUNTER_BEFORE_PICKUP_MIN * 60_000) {
      continue;
    }
    if (!fits_timeline(timeline, start, end)) continue;
    insert_timeline(timeline, start, end);
    return { ...line, start_at: start, end_at: end, line_index: 0 };
  }

  // запасной: первый свободный отрезок от now
  let cursor = now;
  for (const busy of [...timeline].sort((a, b) => a.start - b.start)) {
    if (cursor + prep_ms <= busy.start && cursor + prep_ms <= pickup) {
      insert_timeline(timeline, cursor, cursor + prep_ms);
      return { ...line, start_at: cursor, end_at: cursor + prep_ms, line_index: 0 };
    }
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor + prep_ms <= pickup || soft) {
    const end = cursor + prep_ms;
    insert_timeline(timeline, cursor, end);
    return { ...line, start_at: cursor, end_at: end, line_index: 0 };
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
          prep_minutes: prep_minutes_for_item(menu),
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
  let draft_ok = true;

  for (const line of pending) {
    const is_draft = line.order_id === '__draft__';
    const scheduled = schedule_line(line, timeline, now, !is_draft);
    if (!scheduled) {
      if (is_draft) draft_ok = false;
      continue;
    }
    lines.push({ ...scheduled, line_index: idx++ });
  }

  if (input.cart_lines?.length && input.pickup_at) {
    return { lines, feasible: draft_ok };
  }

  return { lines, feasible: true };
}

/** сколько минут бариста ещё занят текущими заказами */
export function queue_busy_minutes(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const active = input.active_orders.filter((o) =>
    ['new', 'preparing'].includes(o.status)
  );
  let remaining = 0;
  for (const o of active) {
    for (const item of o.items as order_item[]) {
      const menu = input.menu_by_id.get(item.menu_id);
      remaining += prep_minutes_for_item(menu) * item.quantity;
    }
  }
  return Math.ceil(remaining / BARISTA_COUNT);
}

export function min_feasible_pickup_ms(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines: { menu_id: string; name: string; quantity: number }[];
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const cart_prep = cart_prep_minutes(input.cart_lines, input.menu_by_id);
  const busy = queue_busy_minutes(input);
  const wait = Math.max(cart_prep, busy + cart_prep);
  const raw = now + Math.max(2, wait) * 60_000;
  return round_up_to_step(raw, SLOT_STEP_MIN * 60_000);
}

export function is_pickup_feasible(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines: { menu_id: string; name: string; quantity: number }[];
  pickup_at: number;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  if (input.pickup_at <= now + 60_000) return false;

  const cart_prep = cart_prep_minutes(input.cart_lines, input.menu_by_id);
  const busy = queue_busy_minutes(input);
  const available_min = (input.pickup_at - now) / 60_000;

  // хватает ли минут бариста до выдачи на очередь + этот заказ
  if (available_min + 0.5 < busy + cart_prep) return false;

  const { feasible } = build_kitchen_schedule({
    active_orders: input.active_orders,
    menu_by_id: input.menu_by_id,
    cart_lines: input.cart_lines,
    pickup_at: input.pickup_at,
    now,
  });
  return feasible;
}

export function suggest_pickup_slots(input: {
  active_orders: order[];
  menu_by_id: Map<string, menu_item>;
  cart_lines: { menu_id: string; name: string; quantity: number }[];
  now?: number;
  limit?: number;
}): pickup_slot[] {
  const now = input.now ?? Date.now();
  const limit = input.limit ?? SLOT_LIMIT;
  const slots: pickup_slot[] = [];
  const step = SLOT_STEP_MIN * 60_000;
  const asap_at = min_feasible_pickup_ms(input);

  const try_push = (at: number, is_asap: boolean) => {
    if (!is_pickup_feasible({ ...input, pickup_at: at, now })) return;
    const d = new Date(at);
    const iso = d.toISOString();
    if (slots.some((s) => s.at === iso)) return;
    slots.push({
      at: iso,
      label: format_slot_label(d),
      is_asap,
      wait_minutes: Math.max(1, Math.ceil((at - now) / 60_000)),
    });
  };

  try_push(asap_at, true);

  let cursor = asap_at + step;
  const max_at = now + MAX_SLOTS_AHEAD_MIN * 60_000;
  while (slots.length < limit && cursor <= max_at) {
    try_push(cursor, false);
    cursor += step;
  }

  // если почти ничего не набралось — всё равно даём сетку слотов от asap
  if (slots.length < 3) {
    cursor = asap_at;
    while (slots.length < limit && cursor <= max_at) {
      const d = new Date(cursor);
      const iso = d.toISOString();
      if (!slots.some((s) => s.at === iso)) {
        slots.push({
          at: iso,
          label: format_slot_label(d),
          is_asap: cursor === asap_at,
          wait_minutes: Math.max(1, Math.ceil((cursor - now) / 60_000)),
        });
      }
      cursor += step;
    }
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
  return {
    lines: mine,
    starts_in_min: Math.max(0, Math.ceil((next.start_at - now) / 60_000)),
    ready_in_min: Math.max(0, Math.ceil((next.end_at - now) / 60_000)),
    pickup_at: next.pickup_at,
  };
}

export function format_countdown_ms(ms: number) {
  const total_sec = Math.ceil(ms / 1000);
  const m = Math.floor(total_sec / 60);
  const s = total_sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
