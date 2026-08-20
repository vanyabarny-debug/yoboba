import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  is_menu_store_payload,
  read_published_menu,
  write_published_menu,
} from '@/lib/menu-catalog-server';
import { store_version, type menu_store } from '@/lib/menu-store';

async function is_admin() {
  const store = await cookies();
  return (
    store.get(session_cookie)?.value === 'admin' ||
    store.get('yoboba_admin')?.value === '1'
  );
}

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  return NextResponse.json({ store: await read_published_menu() });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as unknown;
  if (!is_menu_store_payload(body) || body.items.length === 0) {
    return NextResponse.json({ error: 'пустое меню' }, { status: 400 });
  }

  const store: menu_store = {
    version: store_version,
    categories: body.categories.filter((c) => typeof c === 'string' && c.trim()),
    items: body.items,
    removed_item_ids: body.removed_item_ids ?? [],
    category_heading_styles: body.category_heading_styles ?? {},
  };

  await write_published_menu(store);
  return NextResponse.json({ ok: true });
}
