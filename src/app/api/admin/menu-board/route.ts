import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_json_store, write_json_store } from '@/lib/data-store';
import { clean_layout, empty_layout, type board_layout } from '@/lib/studio/menu-layout';

const store_key = 'menu-board-layout';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
}

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const layout = await read_json_store<board_layout>(store_key, empty_layout);
  return NextResponse.json({ layout: clean_layout(layout) });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { layout?: unknown } | null;
  const layout = clean_layout(body?.layout);
  await write_json_store(store_key, layout);
  return NextResponse.json({ layout });
}
