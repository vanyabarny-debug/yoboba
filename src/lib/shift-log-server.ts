/** история смены: те же строки, что касса и админка, со статусом */

import { read_json_store, write_json_store } from '@/lib/data-store';
import { moscow_today_iso } from '@/lib/order-number';
import { shift_end_iso, shift_has_ended } from '@/lib/shift-window';
import { ensure_day_in_history, get_spot_day_shift } from '@/lib/shifts-server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';

const store_key = 'shift-log';

export type shift_log_status =
  | 'пробил'
  | 'не пробил'
  | 'закрыл'
  | 'не закрыл'
  | 'выдал'
  | 'не выдал';

export type shift_log_kind = 'opening' | 'closing' | 'card' | 'order';

export type shift_log_row = {
  id: string;
  spot_id: string;
  shift_date: string;
  ref: string;
  kind: shift_log_kind;
  title: string;
  status: shift_log_status;
  seller_name: string | null;
  at: string;
};

const done_status = new Set<shift_log_status>(['пробил', 'закрыл', 'выдал']);

function row_key(row: Pick<shift_log_row, 'spot_id' | 'shift_date' | 'kind' | 'ref'>) {
  return `${row.spot_id}|${row.shift_date}|${row.kind}|${row.ref}`;
}

async function load_all(): Promise<shift_log_row[]> {
  const raw = await read_json_store<shift_log_row[]>(store_key, []);
  return Array.isArray(raw) ? raw : [];
}

async function save_all(rows: shift_log_row[]) {
  await write_json_store(store_key, rows.slice(0, 4000));
}

export async function list_shift_log(shift_date: string, spot_id?: string) {
  const all = await load_all();
  return all.filter((row) => row.shift_date === shift_date && (!spot_id || row.spot_id === spot_id));
}

export async function mark_shift_row(input: Omit<shift_log_row, 'id' | 'at'> & { at?: string }) {
  await write_shift_log([line(input)]);
}

export async function write_shift_log(rows: shift_log_row[]) {
  if (!rows.length) return;
  const all = await load_all();
  const index = new Map(all.map((row, i) => [row_key(row), i]));
  for (const row of rows) {
    const key = row_key(row);
    const at = index.get(key);
    if (at == null) {
      index.set(key, all.length);
      all.push(row);
      continue;
    }
    const prev = all[at];
    if (done_status.has(prev.status) && !done_status.has(row.status)) continue;
    all[at] = { ...row, id: prev.id, at: done_status.has(row.status) ? row.at : prev.at };
  }
  await save_all(all);
}

function line(input: Omit<shift_log_row, 'id' | 'at'> & { at?: string }): shift_log_row {
  return {
    ...input,
    seller_name: input.seller_name?.trim() || null,
    title: input.title.trim().slice(0, 120) || 'карточка',
    at: input.at || new Date().toISOString(),
    id: `log-${input.shift_date}-${input.kind}-${input.ref}`.slice(0, 80),
  };
}

async function checklist_line(
  table: 'opening_tasks' | 'closing_tasks',
  spot_id: string,
  shift_date: string
): Promise<{ done: boolean; seller_name: string | null; at: string | null } | null> {
  if (!is_supabase_configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const supabase = create_service_client();
  const { data } = await supabase
    .from(table)
    .select('completed_at, seller_name')
    .eq('spot_id', spot_id)
    .eq('shift_date', shift_date)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data as { completed_at: string | null; seller_name: string | null }[] | null)?.[0];
  if (!row) return null;
  return {
    done: Boolean(row.completed_at),
    seller_name: row.seller_name,
    at: row.completed_at,
  };
}

/** после 22:00 дописать в историю смены то, что не пробили */
export async function settle_shift_log(input: {
  spot_id: string;
  shift_date?: string;
  spot_address?: string;
  spot_city?: string;
  seller_name?: string | null;
  cards?: { ref: string; title: string; done: boolean; seller_name?: string | null }[];
  orders?: { ref: string; title: string; handed: boolean; seller_name?: string | null }[];
}) {
  const day = input.shift_date || moscow_today_iso();
  if (!shift_has_ended(day)) return { waiting: true as const, rows: [] as shift_log_row[] };

  const who = input.seller_name?.trim() || null;
  const at = shift_end_iso(day);
  const rows: shift_log_row[] = [];

  const opening = await checklist_line('opening_tasks', input.spot_id, day);
  const client_opening = (input.cards || []).find((card) => card.ref === 'opening');
  if (opening || client_opening) {
    const done = opening ? opening.done : Boolean(client_opening?.done);
    rows.push(
      line({
        spot_id: input.spot_id,
        shift_date: day,
        ref: 'opening',
        kind: 'opening',
        title: 'открытие',
        status: done ? 'пробил' : 'не пробил',
        seller_name: done ? opening?.seller_name || client_opening?.seller_name || who : who,
        at: opening?.at || at,
      })
    );
  }

  const closing = await checklist_line('closing_tasks', input.spot_id, day);
  const shift = await get_spot_day_shift(input.spot_id, day);
  const cashier_closed = Boolean(closing?.done || (shift?.closed_at && shift.close_note?.startsWith('закрыл')));
  rows.push(
    line({
      spot_id: input.spot_id,
      shift_date: day,
      ref: 'closing',
      kind: 'closing',
      title: 'закрытие',
      status: cashier_closed ? 'закрыл' : 'не закрыл',
      seller_name: cashier_closed ? closing?.seller_name || who : who,
      at: closing?.at || shift?.closed_at || at,
    })
  );

  if (!cashier_closed) {
    await ensure_day_in_history({
      spot_id: input.spot_id,
      shift_date: day,
      spot_address: input.spot_address || shift?.spot_address,
      spot_city: input.spot_city || shift?.spot_city,
      seller_name: who || shift?.seller_name,
      at,
      close_note: 'не закрыл',
    });
  }

  for (const card of input.cards || []) {
    if (!card.ref || card.ref === 'opening' || card.ref === 'closing') continue;
    rows.push(
      line({
        spot_id: input.spot_id,
        shift_date: day,
        ref: card.ref,
        kind: 'card',
        title: card.title,
        status: card.done ? 'пробил' : 'не пробил',
        seller_name: card.done ? card.seller_name || who : who,
        at,
      })
    );
  }

  for (const order of input.orders || []) {
    if (!order.ref) continue;
    rows.push(
      line({
        spot_id: input.spot_id,
        shift_date: day,
        ref: order.ref,
        kind: 'order',
        title: order.title,
        status: order.handed ? 'выдал' : 'не выдал',
        seller_name: order.seller_name || who,
        at,
      })
    );
  }

  await write_shift_log(rows);
  return { waiting: false as const, rows: await list_shift_log(day, input.spot_id) };
}
