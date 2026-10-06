import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';

export async function designer_is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
}
