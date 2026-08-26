import { NextResponse } from 'next/server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    const store = {
      ...stored,
      items: merge_menu_item_catalog(stored.items),
    };
    return NextResponse.json(
      { store },
      { headers: { 'cache-control': 'private, no-store, max-age=0' } }
    );
  }

  const fresh = get_default_store();
  await write_published_menu(fresh);
  return NextResponse.json(
    { store: fresh },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
