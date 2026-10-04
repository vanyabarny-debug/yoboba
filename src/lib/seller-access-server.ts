import { cookies } from 'next/headers';
import { seller_id_cookie, session_cookie } from '@/lib/session';
import { get_sellers } from '@/lib/sellers-server';
import { full_seller_access, parse_seller_access, type seller_access } from '@/lib/seller-access';

export async function current_seller_access(): Promise<seller_access | null> {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role === 'admin') return full_seller_access();
  if (role !== 'seller') return null;
  const id = store.get(seller_id_cookie)?.value;
  if (!id) return parse_seller_access(null);
  const sellers = await get_sellers();
  const seller = sellers.find((row) => row.id === id);
  return parse_seller_access(seller?.access);
}
