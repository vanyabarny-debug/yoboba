import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  is_published_catalog_key,
  write_published_catalog,
} from '@/lib/published-catalog';

async function is_admin() {
  const store = await cookies();
  return (
    store.get(session_cookie)?.value === 'admin' ||
    store.get('yoboba_admin')?.value === '1'
  );
}

export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const { key } = await params;
  if (!is_published_catalog_key(key)) {
    return NextResponse.json({ error: 'неизвестный ключ' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'пустые данные' }, { status: 400 });
  }

  const store = await write_published_catalog(key, body);
  return NextResponse.json({ ok: true, store });
}
