import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { order } from '@/lib/types';

const data_dir = join(process.cwd(), 'data');
const file_path = join(data_dir, 'demo-orders.json');

function ensure_file(): order[] {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  if (!existsSync(file_path)) {
    writeFileSync(file_path, '[]', 'utf-8');
    return [];
  }
  try {
    return JSON.parse(readFileSync(file_path, 'utf-8')) as order[];
  } catch {
    return [];
  }
}

function save(orders: order[]) {
  if (!existsSync(data_dir)) mkdirSync(data_dir, { recursive: true });
  writeFileSync(file_path, JSON.stringify(orders, null, 2), 'utf-8');
}

export function get_demo_orders(active_only = false): order[] {
  const all = ensure_file();
  if (!active_only) return all;
  return all.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
}

export function add_demo_order(input: Omit<order, 'id' | 'created_at'>): order {
  const orders = ensure_file();
  const record: order = {
    ...input,
    id: `demo-order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
  };
  orders.unshift(record);
  save(orders);
  return record;
}

export function update_demo_order(id: string, patch: Partial<order>): order | null {
  const orders = ensure_file();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch };
  save(orders);
  return orders[idx];
}

export function create_fake_order_from_items(
  items: order['items'],
  pickup_minutes = 12
): order {
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  return add_demo_order({
    user_id: 'guest-demo',
    items,
    total_price: total,
    status: 'new',
    payment_type: 'cash',
    pickup_time: new Date(Date.now() + pickup_minutes * 60000).toISOString(),
  });
}
