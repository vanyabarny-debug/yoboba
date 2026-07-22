import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import type { order } from '@/lib/types';

const store_key = 'demo-orders';

async function load_orders(): Promise<order[]> {
  return read_json_store<order[]>(store_key, []);
}

async function save_orders(orders: order[]) {
  await write_json_store(store_key, orders);
}

function next_demo_order_number(orders: order[]): { order_day: string; order_number: number } {
  const order_day = moscow_today_iso();
  const today_count = orders.filter((o) => {
    const day =
      o.order_day ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(o.created_at));
    return day === order_day;
  }).length;
  return { order_day, order_number: today_count + 1 };
}

export async function get_demo_orders(active_only = false): Promise<order[]> {
  const all = await load_orders();
  if (!active_only) return all;
  return all.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
}

export async function add_demo_order(input: Omit<order, 'id' | 'created_at'>): Promise<order> {
  const orders = await load_orders();
  const daily = next_demo_order_number(orders);
  const record: order = {
    ...input,
    id: `demo-order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    order_number: input.order_number ?? daily.order_number,
    order_day: input.order_day ?? daily.order_day,
  };
  orders.unshift(record);
  await save_orders(orders);
  return record;
}

export async function update_demo_order(
  id: string,
  patch: Partial<order>
): Promise<order | null> {
  const orders = await load_orders();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch };
  await save_orders(orders);
  return orders[idx];
}

export async function create_fake_order_from_items(
  items: order['items'],
  pickup_minutes = 12
): Promise<order> {
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
