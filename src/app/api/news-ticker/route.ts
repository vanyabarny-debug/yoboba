import { NextResponse } from 'next/server';
import { read_published_news_ticker } from '@/lib/news-ticker-server';

export const dynamic = 'force-dynamic';

/** публичные настройки бегущей строки */
export async function GET() {
  const settings = await read_published_news_ticker();
  return NextResponse.json(
    { settings },
    { headers: { 'cache-control': 'private, no-store, max-age=0' } }
  );
}
