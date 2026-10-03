import { cookies } from 'next/headers';
import { seller_id_cookie, seller_name_cookie, session_cookie } from '@/lib/session';
import type { stock_actor } from '@/lib/finance/model';

export async function staff_actor(): Promise<stock_actor | null> {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role === 'seller') {
    return {
      id: store.get(seller_id_cookie)?.value || 'seller',
      name: store.get(seller_name_cookie)?.value?.trim() || 'касса',
      role: 'seller',
    };
  }
  if (role === 'admin') {
    return { id: 'admin', name: 'админ', role: 'admin' };
  }
  return null;
}
