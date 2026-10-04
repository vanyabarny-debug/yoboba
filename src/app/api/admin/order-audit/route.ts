import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { list_order_audit } from '@/lib/order-audit-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await cookies();
  const admin = store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
  if (!admin) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  return NextResponse.json({ events: await list_order_audit() });
}
