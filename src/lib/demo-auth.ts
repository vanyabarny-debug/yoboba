import type { user_role } from '@/lib/session';

export type demo_user = {
  id: string;
  phone: string;
  name: string;
  bonus_balance: number;
  is_guest: boolean;
  role: user_role;
};

const storage_key = 'yoboba_demo_user';

export function get_demo_user(): demo_user | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(storage_key);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as demo_user;
    if (!user.role) user.role = user.is_guest ? 'guest' : 'user';
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
  phone?: string;
  name: string;
  is_guest?: boolean;
  role?: user_role;
}): demo_user {
  const is_guest = Boolean(input.is_guest);
  const user: demo_user = {
    id: `demo-${Date.now()}`,
    phone: input.phone || '',
    name: input.name,
    bonus_balance: is_guest ? 0 : input.role === 'admin' ? 0 : 150,
    is_guest,
    role: input.role || (is_guest ? 'guest' : 'user'),
  };
  set_demo_user(user);
  return user;
}

export async function sync_session(role: user_role) {
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function clear_session() {
  await fetch('/api/auth/session', { method: 'DELETE' });
  clear_demo_user();
}
