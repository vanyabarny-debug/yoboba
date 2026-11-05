import { NextResponse } from 'next/server';
import { upgrade_menu_store } from '@/lib/menu-store';
import { read_published_menu } from '@/lib/menu-catalog-server';

export const dynamic = 'force-dynamic';

/** только чтение: запись на каждый просмотр затирала свежие правки админки устаревшим снимком */
export async function GET() {
  const store = upgrade_menu_store(await read_published_menu());
  return NextResponse.json(
    { store },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
