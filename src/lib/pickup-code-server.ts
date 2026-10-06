import { read_json_store, write_json_store } from '@/lib/data-store';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_service_client } from '@/lib/supabase/service';
import {
  PICKUP_CODE_TTL_MINUTES,
  parse_pickup_code_input,
} from '@/lib/pickup-code';

export {
  PICKUP_CODE_TTL_MINUTES,
  parse_pickup_code_input,
  pickup_qr_payload,
} from '@/lib/pickup-code';

const demo_store_key = 'demo-pickup-codes';

type demo_row = {
  user_id: string;
  code: string;
  expires_at: string;
  used_at: string | null;
  name?: string | null;
  phone?: string | null;
  bonus_balance?: number;
};

export type pickup_code_result = {
  code: string;
  expires_at: string;
};

export type resolved_pickup = {
  user_id: string;
  code: string;
  name: string | null;
  phone: string | null;
  bonus_balance: number;
};

function mint_digits(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, '0');
}

async function load_demo(): Promise<demo_row[]> {
  return read_json_store<demo_row[]>(demo_store_key, []);
}

async function save_demo(rows: demo_row[]) {
  await write_json_store(demo_store_key, rows);
}

function is_active(row: demo_row, now = Date.now()) {
  return !row.used_at && new Date(row.expires_at).getTime() > now;
}

async function ensure_demo_code(input: {
  user_id: string;
  name?: string | null;
  phone?: string | null;
  bonus_balance?: number;
}): Promise<pickup_code_result> {
  const rows = await load_demo();
  const now = Date.now();
  const active = rows.find((r) => r.user_id === input.user_id && is_active(r, now));
  if (active) {
    return { code: active.code, expires_at: active.expires_at };
  }

  const next = rows.map((r) =>
    r.user_id === input.user_id && !r.used_at
      ? { ...r, used_at: new Date().toISOString() }
      : r
  );

  let code = mint_digits();
  for (let i = 0; i < 12; i++) {
    if (!next.some((r) => r.code === code && is_active(r, now))) break;
    code = mint_digits();
  }

  const expires_at = new Date(now + PICKUP_CODE_TTL_MINUTES * 60_000).toISOString();
  next.push({
    user_id: input.user_id,
    code,
    expires_at,
    used_at: null,
    name: input.name ?? null,
    phone: input.phone ?? null,
    bonus_balance: input.bonus_balance ?? 0,
  });
  await save_demo(next);
  return { code, expires_at };
}

export async function ensure_pickup_code(input: {
  user_id: string;
  name?: string | null;
  phone?: string | null;
  bonus_balance?: number;
}): Promise<pickup_code_result> {
  if (!is_supabase_configured()) {
    return ensure_demo_code(input);
  }

  const admin = create_service_client();
  const { data, error } = await admin.rpc('ensure_pickup_code', {
    p_user_id: input.user_id,
    p_ttl_minutes: PICKUP_CODE_TTL_MINUTES,
  });

  if (error) {
    throw new Error(error.message || 'не удалось создать код');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.code || !row?.expires_at) {
    throw new Error('не удалось создать код');
  }

  return {
    code: String(row.code),
    expires_at: String(row.expires_at),
  };
}

export async function resolve_pickup_code(
  raw: string | null | undefined
): Promise<resolved_pickup | null> {
  const code = parse_pickup_code_input(raw);
  if (!code) return null;

  if (!is_supabase_configured()) {
    const rows = await load_demo();
    const now = Date.now();
    const row = rows.find((r) => r.code === code && is_active(r, now));
    if (!row) return null;
    return {
      user_id: row.user_id,
      code: row.code,
      name: row.name ?? null,
      phone: row.phone ?? null,
      bonus_balance: row.bonus_balance ?? 0,
    };
  }

  const admin = create_service_client();
  const { data: user_id, error } = await admin.rpc('resolve_pickup_code', {
    p_code: code,
  });

  if (error || !user_id) return null;

  const full = await admin
    .from('profiles')
    .select(
      'id, name, phone, bonus_balance, student_claimed, student_verified, student_verified_at, student_verified_by'
    )
    .eq('id', user_id)
    .maybeSingle();

  const profile = full.error
    ? (
        await admin
          .from('profiles')
          .select('id, name, phone, bonus_balance')
          .eq('id', user_id)
          .maybeSingle()
      ).data
    : full.data;

  if (!profile) return null;

  return {
    user_id: profile.id,
    code,
    name: profile.name ?? null,
    phone: profile.phone ?? null,
    bonus_balance: profile.bonus_balance ?? 0,
  };
}

export async function invalidate_pickup_code(input: {
  user_id?: string | null;
  code?: string | null;
}): Promise<boolean> {
  const code = parse_pickup_code_input(input.code);

  if (!is_supabase_configured()) {
    const rows = await load_demo();
    let changed = false;
    const next = rows.map((r) => {
      const match_code = code && r.code === code && !r.used_at;
      const match_user = input.user_id && r.user_id === input.user_id && !r.used_at;
      if (match_code || match_user) {
        changed = true;
        return { ...r, used_at: new Date().toISOString() };
      }
      return r;
    });
    if (changed) await save_demo(next);
    return changed;
  }

  const admin = create_service_client();
  const { data, error } = await admin.rpc('invalidate_pickup_code', {
    p_user_id: input.user_id || null,
    p_code: code,
  });

  if (error) return false;
  return Boolean(data);
}

/** простой rate-limit на lookup по коду (на инстанс) */
const lookup_hits = new Map<string, { count: number; reset_at: number }>();

export function pickup_lookup_allowed(key: string, limit = 30, window_ms = 60_000): boolean {
  const now = Date.now();
  const row = lookup_hits.get(key);
  if (!row || row.reset_at <= now) {
    lookup_hits.set(key, { count: 1, reset_at: now + window_ms });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}
