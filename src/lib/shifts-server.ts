import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import type { seller_shift_record, shift_crew_member, shift_open_geo } from '@/lib/types';
export { shift_crew_names } from '@/lib/shift-crew';

const store_key = 'seller-shifts';

async function load_shifts(): Promise<seller_shift_record[]> {
  return read_json_store<seller_shift_record[]>(store_key, []);
}

async function save_shifts(shifts: seller_shift_record[]) {
  await write_json_store(store_key, shifts);
}

function with_crew_member(
  shift: seller_shift_record,
  seller_id: string,
  seller_name: string
): seller_shift_record {
  if (!seller_id) return shift;
  const crew = [...(shift.crew || [])];
  if (!crew.some((m) => m.seller_id === seller_id)) {
    // legacy: opener только в seller_* — подтянем его в crew
    if (
      shift.seller_id &&
      shift.seller_id !== seller_id &&
      !crew.some((m) => m.seller_id === shift.seller_id)
    ) {
      crew.unshift({
        seller_id: shift.seller_id,
        seller_name: shift.seller_name,
        joined_at: shift.opened_at,
      });
    }
    const member: shift_crew_member = {
      seller_id,
      seller_name: seller_name || 'бариста',
      joined_at: new Date().toISOString(),
    };
    crew.push(member);
  }
  return { ...shift, crew };
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

/** смена точки на календарный день (одна на точку) */
export async function get_spot_day_shift(
  spot_id: string,
  shift_date = moscow_today_iso()
): Promise<seller_shift_record | null> {
  const all = await load_shifts();
  return (
    all.find((s) => s.spot_id === spot_id && s.shift_date === shift_date) || null
  );
}

function normalize_open_geo(raw: shift_open_geo | null | undefined): shift_open_geo | null {
  if (!raw || typeof raw !== 'object') return null;
  const status = raw.status;
  if (
    status !== 'ok' &&
    status !== 'denied' &&
    status !== 'unavailable' &&
    status !== 'timeout' &&
    status !== 'error'
  ) {
    return null;
  }
  const lat = typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : null;
  const lng = typeof raw.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : null;
  const accuracy =
    typeof raw.accuracy === 'number' && Number.isFinite(raw.accuracy) ? raw.accuracy : null;
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 200) || null : null;
  return { lat, lng, accuracy, label, status };
}

/**
 * Открыть смену точки после завершения чек-листа открытия.
 * Одна смена на точку в день — повторное открытие после закрытия запрещено.
 */
export async function open_shift_from_opening(input: {
  spot_id: string;
  spot_address: string;
  spot_city: string;
  seller_id: string;
  seller_name: string;
  opened_at?: string | null;
  open_geo?: shift_open_geo | null;
}): Promise<{ shift: seller_shift_record; created: boolean } | { error: string }> {
  const all = await load_shifts();
  const today = moscow_today_iso();
  const open_geo = normalize_open_geo(input.open_geo);
  const existing_idx = all.findIndex(
    (s) => s.spot_id === input.spot_id && s.shift_date === today
  );

  if (existing_idx >= 0) {
    const existing = all[existing_idx];
    if (existing.closed_at) {
      return { error: 'смена на этой точке уже закрыта — повторное открытие нельзя' };
    }
    let next = with_crew_member(existing, input.seller_id, input.seller_name);
    if (!existing.open_geo && open_geo) {
      next = { ...next, open_geo };
    }
    if (next !== existing) {
      all[existing_idx] = next;
      await save_shifts(all);
    }
    return { shift: next, created: false };
  }

  const opened_at = input.opened_at || new Date().toISOString();
  const record: seller_shift_record = {
    id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    spot_id: input.spot_id,
    spot_address: input.spot_address,
    spot_city: input.spot_city,
    seller_id: input.seller_id,
    seller_name: input.seller_name,
    opened_at,
    closed_at: null,
    shift_date: today,
    open_geo,
    crew: input.seller_id
      ? [
          {
            seller_id: input.seller_id,
            seller_name: input.seller_name,
            joined_at: opened_at,
          },
        ]
      : [],
  };
  all.push(record);
  await save_shifts(all);
  return { shift: record, created: true };
}

/** бариста зашёл на уже открытую смену точки */
export async function join_shift_crew(input: {
  spot_id: string;
  shift_date?: string;
  seller_id: string;
  seller_name: string;
}): Promise<seller_shift_record | null> {
  if (!input.seller_id) return get_spot_day_shift(input.spot_id, input.shift_date);
  const all = await load_shifts();
  const day = input.shift_date || moscow_today_iso();
  const idx = all.findIndex((s) => s.spot_id === input.spot_id && s.shift_date === day);
  if (idx < 0) return null;
  const current = all[idx];
  if (current.closed_at) return current;
  const next = with_crew_member(current, input.seller_id, input.seller_name);
  if (next === current) return current;
  all[idx] = next;
  await save_shifts(all);
  return next;
}

/** закрыть смену точки после завершения чек-листа закрытия */
export async function close_shift_from_closing(input: {
  spot_id: string;
  shift_date?: string;
  seller_id?: string;
  seller_name?: string;
}): Promise<{ shift: seller_shift_record } | { error: string }> {
  const all = await load_shifts();
  const day = input.shift_date || moscow_today_iso();
  const idx = all.findIndex((s) => s.spot_id === input.spot_id && s.shift_date === day);
  if (idx < 0) {
    return { error: 'смена на точке не найдена — сначала завершите открытие' };
  }
  const current = all[idx];
  if (current.closed_at) {
    return { shift: current };
  }
  let closed: seller_shift_record = {
    ...current,
    closed_at: new Date().toISOString(),
  };
  if (input.seller_id) {
    closed = with_crew_member(
      closed,
      input.seller_id,
      input.seller_name || current.seller_name
    );
  }
  all[idx] = closed;
  await save_shifts(all);
  return { shift: closed };
}

/** @deprecated клик кассира больше не открывает смену — только чек-лист открытия */
export async function open_or_resume_shift(input: {
  spot_id: string;
  spot_address: string;
  spot_city: string;
  seller_id: string;
  seller_name: string;
  open_geo?: shift_open_geo | null;
}): Promise<seller_shift_record> {
  const existing = await get_spot_day_shift(input.spot_id);
  if (existing) {
    if (existing.closed_at) {
      return existing;
    }
    return existing;
  }
  const result = await open_shift_from_opening(input);
  if ('error' in result) {
    throw new Error(result.error);
  }
  return result.shift;
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
