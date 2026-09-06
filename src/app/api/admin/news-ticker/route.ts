import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  read_published_news_ticker,
  write_published_news_ticker,
} from '@/lib/news-ticker-server';
import {
  normalize_news_ticker,
  type news_ticker_settings,
} from '@/lib/news-ticker-store';

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
  return NextResponse.json({ settings: await read_published_news_ticker() });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Partial<news_ticker_settings> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'пустые настройки' }, { status: 400 });
  }

  const settings = await write_published_news_ticker(normalize_news_ticker(body));
  return NextResponse.json({ ok: true, settings });
}
