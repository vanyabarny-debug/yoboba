import { read_durable_json, write_durable_json } from '@/lib/durable-json';
import type { order } from '@/lib/types';

const store_key = 'handed-orders';

export type handed_order_row = {
  order_id: string;
  seller_id: string;
  seller_name: string;
  shift_date: string;
  handed_at: string;
  order: order;
};

async function load_all(): Promise<handed_order_row[]> {
  const raw = await read_durable_json<handed_order_row[]>(store_key, []);
  return Array.isArray(raw) ? raw : [];
}

async function save_all(rows: handed_order_row[]) {
  await write_durable_json(store_key, rows);
}

/** записать выдачу; повтор по order_id+shift_date не дублирует */
export async function record_handed_order(input: {
  order: order;
  seller_id: string;
  seller_name: string;
  shift_date: string;
  handed_at?: string;
}): Promise<handed_order_row> {
  const all = await load_all();
  const handed_at = input.handed_at || new Date().toISOString();
  const existing = all.findIndex(
    (r) => r.order_id === input.order.id && r.shift_date === input.shift_date
  );
  const row: handed_order_row = {
    order_id: input.order.id,
    seller_id: input.seller_id,
    seller_name: input.seller_name,
    shift_date: input.shift_date,
    handed_at,
    order: { ...input.order, status: 'completed' },
  };
  if (existing >= 0) {
    all[existing] = row;
  } else {
    all.unshift(row);
  }
  await save_all(all);
  return row;
}

export async function list_handed_rows(seller_id?: string): Promise<handed_order_row[]> {
  const all = await load_all();
  if (!seller_id) return all;
  return all.filter((r) => r.seller_id === seller_id);
}

export async function forget_handed_order(order_id: string) {
  const all = await load_all();
  const next = all.filter((row) => row.order_id !== order_id);
  if (next.length === all.length) return;
  await save_all(next);
}

export async function replace_handed_snapshot(order: order) {
  const all = await load_all();
  let changed = false;
  for (const row of all) {
    if (row.order_id !== order.id) continue;
    row.order = {
      ...order,
      status: row.order.status === 'completed' ? 'completed' : order.status,
    };
    changed = true;
  }
  if (changed) await save_all(all);
}

export async function get_handed_orders(input: {
  shift_date: string;
  seller_id?: string;
}): Promise<order[]> {
  const all = await load_all();
  const rows = all.filter((r) => {
    if (r.shift_date !== input.shift_date) return false;
    if (input.seller_id && r.seller_id !== input.seller_id) return false;
    return true;
  });
  const seen = new Set<string>();
  const orders: order[] = [];
  for (const r of rows) {
    if (seen.has(r.order_id)) continue;
    seen.add(r.order_id);
    orders.push(r.order);
  }
  orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return orders;
}
