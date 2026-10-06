import { NextResponse } from 'next/server';
import { get_default_store, merge_menu_item_catalog, store_version } from '@/lib/menu-store';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stored = await read_published_menu();
  if (stored && stored.version >= store_version && stored.items?.length) {
    const merged_items = merge_menu_item_catalog(stored.items, stored.removed_item_ids ?? []);
    const merged_store = {
      ...stored,
      items: merged_items,
    };
    // миграция: снимок из старого каталога сохраняется в постоянную историю
    await write_published_menu(merged_store);
    return NextResponse.json(
      { store: merged_store },
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
