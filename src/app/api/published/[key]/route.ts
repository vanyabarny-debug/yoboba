import { NextResponse } from 'next/server';
import {
  is_published_catalog_key,
  read_published_catalog,
} from '@/lib/published-catalog';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!is_published_catalog_key(key)) {
    return NextResponse.json({ error: 'неизвестный ключ' }, { status: 404 });
  }
  const store = await read_published_catalog(key);
  return NextResponse.json(
    { store },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
