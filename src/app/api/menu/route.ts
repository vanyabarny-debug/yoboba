import { NextResponse } from 'next/server';
import { read_published_menu } from '@/lib/menu-catalog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await read_published_menu();
  return NextResponse.json(
    { store },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
