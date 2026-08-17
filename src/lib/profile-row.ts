import type { profile } from '@/lib/auth';

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

export function as_profile_row(
  row: Record<string, unknown> | null | undefined
): profile | null {
  if (!row || typeof row.id !== 'string') return null;
  const role = row.role;
  return {
    id: row.id,
    phone: typeof row.phone === 'string' ? row.phone : null,
    name: typeof row.name === 'string' ? row.name : null,
    bonus_balance: Number(row.bonus_balance) || 0,
    avatar_emoji: typeof row.avatar_emoji === 'string' ? row.avatar_emoji : null,
    avatar_bg: typeof row.avatar_bg === 'string' ? row.avatar_bg : null,
    role: (typeof role === 'string' && role ? role : 'user') as profile['role'],
  };
}

export async function read_profile(client: profiles_client, user_id: string) {
  const full = await client
    .from('profiles')
    .select(PROFILE_SELECT_WITH_BG)
    .eq('id', user_id)
    .maybeSingle();

  if (!is_missing_avatar_bg_column(full.error)) {
    return {
      data: as_profile_row(full.data),
      error: full.error,
      missing_avatar_bg: false,
    };
  }

  const fallback = await client
    .from('profiles')
    .select(PROFILE_SELECT_NO_BG)
    .eq('id', user_id)
    .maybeSingle();

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
    .select(PROFILE_SELECT_WITH_BG)
    .maybeSingle();

  if (!is_missing_avatar_bg_column(full.error)) {
    return {
      data: as_profile_row(full.data),
      error: full.error,
      missing_avatar_bg: false,
    };
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
