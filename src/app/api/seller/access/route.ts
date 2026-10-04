import { NextResponse } from 'next/server';
import { current_seller_access } from '@/lib/seller-access-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await current_seller_access();
  if (!access) return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  return NextResponse.json(
    { access },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
