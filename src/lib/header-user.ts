import type { demo_user } from '@/lib/demo-auth';

const storage_key = 'yoboba_header_user';

function as_header_user(user: demo_user): demo_user | null {
  if (!user.id || user.is_guest || user.role !== 'user') return null;
  return {
    id: user.id,
    phone: user.phone || '',
    name: user.name || '',
    bonus_balance: user.bonus_balance || 0,
    avatar_emoji: user.avatar_emoji || '',
    avatar_bg: user.avatar_bg ?? null,
    avatar_url: user.avatar_url ?? null,
    is_guest: false,
    role: 'user',
  };
}

/** последний показанный профиль в шапке — чтобы при загрузке не мелькало «войти» */
export function peek_header_user(): demo_user | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storage_key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as demo_user;
    return as_header_user(parsed);
  } catch {
    return null;
  }
}

export function remember_header_user(user: demo_user | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      localStorage.removeItem(storage_key);
      return;
    }
    const snap = as_header_user(user);
    if (!snap) {
      localStorage.removeItem(storage_key);
      return;
    }
    localStorage.setItem(storage_key, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}
