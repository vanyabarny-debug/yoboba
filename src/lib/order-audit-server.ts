import { randomBytes } from 'crypto';
import { read_durable_json, write_durable_json } from '@/lib/durable-json';

const store_key = 'order-audit';
export const audit_keep_ms = 30 * 24 * 60 * 60 * 1000;

export type order_audit_event = {
  id: string;
  at: string;
  action: 'delete' | 'update';
  actor_id: string;
  actor_name: string;
  order_id: string;
  order_label: string;
  before: string;
  after: string | null;
  before_total: number;
  after_total: number | null;
};

function within_month(at: string, now = Date.now()) {
  const time = new Date(at).getTime();
  return Number.isFinite(time) && now - time <= audit_keep_ms;
}

function is_event(value: unknown): value is order_audit_event {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<order_audit_event>;
  return (
    typeof row.id === 'string' &&
    typeof row.at === 'string' &&
    (row.action === 'delete' || row.action === 'update') &&
    typeof row.actor_name === 'string' &&
    typeof row.order_label === 'string'
  );
}

async function read_events() {
  const raw = await read_durable_json<unknown>(store_key, []);
  const rows = Array.isArray(raw) ? raw.filter(is_event) : [];
  return rows.filter((row) => within_month(row.at));
}

export async function record_order_audit(event: Omit<order_audit_event, 'id' | 'at'> & { at?: string }) {
  const events = await read_events();
  const row: order_audit_event = {
    ...event,
    id: `aud_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    at: event.at || new Date().toISOString(),
  };
  await write_durable_json(store_key, [row, ...events].slice(0, 400));
  return row;
}

export async function list_order_audit() {
  const events = await read_events();
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}
