import type { user_role } from '@/lib/session';
import { avatar_emoji_from_id, random_avatar_emoji } from '@/lib/avatar-emoji';

export type demo_user = {
  id: string;
  phone: string;
  name: string;
  bonus_balance: number;
  avatar_emoji: string;
  avatar_bg: string | null;
  avatar_url?: string | null;
  is_guest: boolean;
  role: user_role;
};

const storage_key = 'yoboba_demo_user';
const staff_roles: user_role[] = ['admin', 'barista', 'seller'];

export function get_demo_user(): demo_user | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(storage_key);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as demo_user;
    if (!user.role) user.role = user.is_guest ? 'guest' : 'user';
    if (!user.avatar_emoji) {
      user.avatar_emoji = avatar_emoji_from_id(user.id || user.phone || 'guest');
      try {
        localStorage.setItem(storage_key, JSON.stringify(user));
      } catch {
        /* ignore */
      }
    }
    if (user.avatar_bg === undefined) user.avatar_bg = null;
    return user;
  } catch {
    return null;
  }
}

export function set_demo_user(user: demo_user) {
  localStorage.setItem(storage_key, JSON.stringify(user));
}

export function clear_demo_user() {
  localStorage.removeItem(storage_key);
}

export function create_demo_user(input: {
  id?: string;
  phone?: string;
  name: string;
  is_guest?: boolean;
  role?: user_role;
  force?: boolean;
}): demo_user {
  const existing = get_demo_user();
  const next_role = input.role || (input.is_guest ? 'guest' : 'user');
  if (
    !input.force &&
    existing &&
    staff_roles.includes(existing.role) &&
    !staff_roles.includes(next_role)
  ) {
    return existing;
  }

  const is_guest = Boolean(input.is_guest);
  const user: demo_user = {
    id: input.id || `demo-${Date.now()}`,
    phone: input.phone || '',
    name: input.name,
    bonus_balance: is_guest ? 0 : input.role === 'admin' ? 0 : 150,
    avatar_emoji: random_avatar_emoji(),
    avatar_bg: null,
    is_guest,
    role: input.role || (is_guest ? 'guest' : 'user'),
  };
  set_demo_user(user);
  return user;
}

export async function sync_session(role: user_role) {
  const current = await fetch('/api/auth/session', { credentials: 'same-origin' });
  if (current.ok) {
    const data = (await current.json()) as { role: user_role | null };
    if (data.role && staff_roles.includes(data.role) && !staff_roles.includes(role)) {
      return;
    }
  }

  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ role }),
  });
}

export async function clear_session() {
  await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
  clear_demo_user();
}
