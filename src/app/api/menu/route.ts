import { NextResponse } from 'next/server';
import { upgrade_menu_store } from '@/lib/menu-store';
import { read_published_menu, write_published_menu } from '@/lib/menu-catalog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stored = await read_published_menu();
  const store = upgrade_menu_store(stored);
  // всегда merge+publish: кастомные позиции не затираются дефолтом при bump version
  await write_published_menu(store);
  return NextResponse.json(
    { store },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
