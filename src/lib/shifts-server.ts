import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import type { seller_shift_record } from '@/lib/types';

const store_key = 'seller-shifts';

async function load_shifts(): Promise<seller_shift_record[]> {
  return read_json_store<seller_shift_record[]>(store_key, []);
}

async function save_shifts(shifts: seller_shift_record[]) {
  await write_json_store(store_key, shifts);
}

export async function list_shifts(filters?: {
  spot_id?: string;
  seller_id?: string;
  shift_date?: string;
  open_only?: boolean;
}): Promise<seller_shift_record[]> {
  let all = await load_shifts();
  if (filters?.spot_id) all = all.filter((s) => s.spot_id === filters.spot_id);
  if (filters?.seller_id) all = all.filter((s) => s.seller_id === filters.seller_id);
  if (filters?.shift_date) all = all.filter((s) => s.shift_date === filters.shift_date);
  if (filters?.open_only) all = all.filter((s) => !s.closed_at);
  return all.sort(
    (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
  );
}

export async function get_shift(id: string): Promise<seller_shift_record | null> {
  const all = await load_shifts();
  return all.find((s) => s.id === id) || null;
}

/** открыть смену или продолжить незакрытую на этой точке у этого кассира */
export async function open_or_resume_shift(input: {
  spot_id: string;
  spot_address: string;
  spot_city: string;
  seller_id: string;
  seller_name: string;
}): Promise<seller_shift_record> {
  const all = await load_shifts();
  const existing = all.find(
    (s) =>
      !s.closed_at &&
      s.spot_id === input.spot_id &&
      s.seller_id === input.seller_id
  );
  if (existing) return existing;

  const record: seller_shift_record = {
    id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    spot_id: input.spot_id,
    spot_address: input.spot_address,
    spot_city: input.spot_city,
    seller_id: input.seller_id,
    seller_name: input.seller_name,
    opened_at: new Date().toISOString(),
    closed_at: null,
    shift_date: moscow_today_iso(),
  };
  all.push(record);
  await save_shifts(all);
  return record;
}

export async function close_shift(id: string): Promise<seller_shift_record | null> {
  const all = await load_shifts();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  if (!all[idx].closed_at) {
    all[idx] = { ...all[idx], closed_at: new Date().toISOString() };
    await save_shifts(all);
  }
  return all[idx];
}
