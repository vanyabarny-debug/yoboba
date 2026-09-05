import type { profile } from '@/lib/auth';
import { parse_student_status } from '@/lib/student-discount';

export const PROFILE_SELECT_WITH_STUDENT =
  'id, phone, name, bonus_balance, avatar_emoji, avatar_bg, role, student_claimed, student_verified, student_verified_at, student_verified_by';
export const PROFILE_SELECT_WITH_BG =
  'id, phone, name, bonus_balance, avatar_emoji, avatar_bg, role';
export const PROFILE_SELECT_NO_BG =
  'id, phone, name, bonus_balance, avatar_emoji, role';

type query_error = { message?: string; code?: string } | null;

type profiles_client = {
  from: (table: string) => any;
};

export function is_missing_avatar_bg_column(error: query_error | undefined) {
  const msg = error?.message || '';
  return msg.includes('avatar_bg') && msg.includes('does not exist');
}

function is_missing_student_column(error: query_error | undefined) {
  const msg = error?.message || '';
  return /student_claimed|student_verified/.test(msg) && /does not exist|schema cache/i.test(msg);
}

export function as_profile_row(
  row: Record<string, unknown> | null | undefined
): profile | null {
  if (!row || typeof row.id !== 'string') return null;
  const role = row.role;
  const student = parse_student_status(row);
  return {
    id: row.id,
    phone: typeof row.phone === 'string' ? row.phone : null,
    name: typeof row.name === 'string' ? row.name : null,
    bonus_balance: Number(row.bonus_balance) || 0,
    avatar_emoji: typeof row.avatar_emoji === 'string' ? row.avatar_emoji : null,
    avatar_bg: typeof row.avatar_bg === 'string' ? row.avatar_bg : null,
    role: (typeof role === 'string' && role ? role : 'user') as profile['role'],
    student_claimed: student.student_claimed,
    student_verified: student.student_verified,
    student_verified_at: student.student_verified_at,
    student_verified_by: student.student_verified_by,
  };
}

async function select_profile(client: profiles_client, user_id: string, columns: string) {
  return client.from('profiles').select(columns).eq('id', user_id).maybeSingle();
}

export async function read_profile(client: profiles_client, user_id: string) {
  const full = await select_profile(client, user_id, PROFILE_SELECT_WITH_STUDENT);
  if (!full.error) {
    return {
      data: as_profile_row(full.data),
      error: full.error,
      missing_avatar_bg: false,
    };
  }

  if (is_missing_student_column(full.error) || is_missing_avatar_bg_column(full.error)) {
    const mid = await select_profile(client, user_id, PROFILE_SELECT_WITH_BG);
    if (!is_missing_avatar_bg_column(mid.error)) {
      return {
        data: as_profile_row(mid.data),
        error: mid.error,
        missing_avatar_bg: false,
      };
    }
  }

  const fallback = await select_profile(client, user_id, PROFILE_SELECT_NO_BG);
  return {
    data: as_profile_row(fallback.data),
    error: fallback.error,
    missing_avatar_bg: true,
  };
}

export async function update_profile_row(
  client: profiles_client,
  user_id: string,
  updates: Record<string, unknown>
) {
  const full = await client
    .from('profiles')
    .update(updates)
    .eq('id', user_id)
    .select(PROFILE_SELECT_WITH_STUDENT)
    .maybeSingle();

  if (!full.error) {
    return {
      data: as_profile_row(full.data),
      error: full.error,
      missing_avatar_bg: false,
    };
  }

  if (is_missing_student_column(full.error) || is_missing_avatar_bg_column(full.error)) {
    const { student_claimed, student_verified, student_verified_at, student_verified_by, ...rest } =
      updates;
    const mid = await client
      .from('profiles')
      .update(rest)
      .eq('id', user_id)
      .select(PROFILE_SELECT_WITH_BG)
      .maybeSingle();
    if (!is_missing_avatar_bg_column(mid.error)) {
      const data = as_profile_row(mid.data);
      return {
        data: data
          ? {
              ...data,
              student_claimed: student_claimed === true || data.student_claimed,
              student_verified: student_verified === true || data.student_verified,
              student_verified_at:
                typeof student_verified_at === 'string'
                  ? student_verified_at
                  : data.student_verified_at,
              student_verified_by:
                typeof student_verified_by === 'string'
                  ? student_verified_by
                  : data.student_verified_by,
            }
          : data,
        error: mid.error,
        missing_avatar_bg: false,
      };
    }
  }

  const fallback = await client
    .from('profiles')
    .update(updates)
    .eq('id', user_id)
    .select(PROFILE_SELECT_NO_BG)
    .maybeSingle();

  return {
    data: as_profile_row(fallback.data),
    error: fallback.error,
    missing_avatar_bg: true,
  };
}
