import { cookies } from 'next/headers';
import { read_json_store, write_json_store } from '@/lib/data-store';
import { normalize_phone } from '@/lib/phone';
import { session_cookie, seller_name_cookie } from '@/lib/session';
import {
  empty_student_status,
  parse_student_status,
  type student_status,
} from '@/lib/student-discount';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';

const store_key = 'student-status';

type student_row = student_status & {
  user_id: string | null;
  phone: string | null;
};

const student_columns =
  'student_claimed, student_verified, student_verified_at, student_verified_by';

function is_missing_student_column(message: string | undefined) {
  const msg = message || '';
  return /student_claimed|student_verified|schema cache/i.test(msg) && /does not exist|schema cache/i.test(msg);
}

async function load_local(): Promise<student_row[]> {
  return read_json_store<student_row[]>(store_key, []);
}

async function save_local(rows: student_row[]) {
  await write_json_store(store_key, rows);
}

function match_row(row: student_row, user_id?: string | null, phone?: string | null) {
  if (user_id && row.user_id === user_id) return true;
  const a = normalize_phone(phone);
  const b = normalize_phone(row.phone);
  return Boolean(a && b && a === b);
}

async function upsert_local(next: student_row) {
  const rows = await load_local();
  const idx = rows.findIndex((row) => match_row(row, next.user_id, next.phone));
  if (idx >= 0) rows[idx] = { ...rows[idx], ...next };
  else rows.push(next);
  await save_local(rows);
  return next;
}

export async function read_local_student_status(input: {
  user_id?: string | null;
  phone?: string | null;
}): Promise<student_status> {
  const rows = await load_local();
  const found = rows.find((row) => match_row(row, input.user_id, input.phone));
  return found ? parse_student_status(found) : empty_student_status();
}

export async function read_student_status(input: {
  user_id?: string | null;
  phone?: string | null;
}): Promise<student_status> {
  const local = await read_local_student_status(input);

  if (!is_supabase_configured()) return local;

  const admin = create_service_client();
  if (input.user_id) {
    const { data, error } = await admin
      .from('profiles')
      .select(`id, phone, ${student_columns}`)
      .eq('id', input.user_id)
      .maybeSingle();
    if (!error && data) {
      return parse_student_status(data as Record<string, unknown>);
    }
  }

  const phone = normalize_phone(input.phone);
  if (phone) {
    const { data, error } = await admin
      .from('profiles')
      .select(`id, phone, ${student_columns}`)
      .eq('phone', phone)
      .maybeSingle();
    if (!error && data) {
      return parse_student_status(data as Record<string, unknown>);
    }
    if (error && is_missing_student_column(error.message)) return local;
  }

  return local;
}

async function write_supabase(
  user_id: string | null,
  phone: string | null,
  patch: Record<string, unknown>
) {
  if (!is_supabase_configured()) return { ok: false as const, missing: false };
  const admin = create_service_client();
  const payload = { ...patch, updated_at: new Date().toISOString() };

  if (user_id) {
    const { error } = await admin.from('profiles').update(payload).eq('id', user_id);
    if (!error) return { ok: true as const, missing: false };
    if (is_missing_student_column(error.message)) return { ok: false as const, missing: true };
  }

  const e164 = normalize_phone(phone);
  if (e164) {
    const { error } = await admin.from('profiles').update(payload).eq('phone', e164);
    if (!error) return { ok: true as const, missing: false };
    if (is_missing_student_column(error.message)) return { ok: false as const, missing: true };
  }

  return { ok: false as const, missing: false };
}

export async function set_student_claimed(input: {
  user_id: string;
  phone?: string | null;
  claimed: boolean;
}): Promise<student_status> {
  const current = await read_student_status(input);
  const next: student_status = {
    ...current,
    student_claimed: input.claimed,
  };
  await write_supabase(input.user_id, input.phone || null, {
    student_claimed: next.student_claimed,
  });
  await upsert_local({
    user_id: input.user_id,
    phone: normalize_phone(input.phone) || input.phone || null,
    ...next,
  });
  return next;
}

export async function set_student_verified(input: {
  user_id?: string | null;
  phone?: string | null;
  verified: boolean;
  by: string;
}): Promise<student_status> {
  const current = await read_student_status(input);
  const next: student_status = {
    student_claimed: input.verified ? true : current.student_claimed,
    student_verified: input.verified,
    student_verified_at: input.verified ? new Date().toISOString() : null,
    student_verified_by: input.verified ? input.by : null,
  };

  await write_supabase(input.user_id || null, input.phone || null, {
    student_claimed: next.student_claimed,
    student_verified: next.student_verified,
    student_verified_at: next.student_verified_at,
    student_verified_by: next.student_verified_by,
  });
  await upsert_local({
    user_id: input.user_id || null,
    phone: normalize_phone(input.phone) || input.phone || null,
    ...next,
  });
  return next;
}

export async function staff_actor_name() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role === 'seller') {
    return store.get(seller_name_cookie)?.value?.trim() || 'касса';
  }
  if (role === 'admin') return 'админ';
  return 'персонал';
}
