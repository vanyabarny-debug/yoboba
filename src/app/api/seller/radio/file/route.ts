import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_radio } from '@/lib/radio-server';
import { kick_radio_file, radio_file_error, radio_file_response, safe_track_id } from '@/lib/radio-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const url = new URL(request.url);
  const id = safe_track_id(url.searchParams.get('id') || '');
  if (!id) return NextResponse.json({ error: 'нет такой ссылки' }, { status: 404 });
  const source = await read_radio();
  const track = source.tracks.find((item) => item.id === id);
  if (!track) return NextResponse.json({ error: 'нет такой ссылки' }, { status: 404 });

  const state = kick_radio_file(track, url.searchParams.get('retry') === '1');
  if (state === 'ready') {
    const file = radio_file_response(id);
    if (file) return file;
  }
  if (state === 'failed') {
    return NextResponse.json({ error: radio_file_error(id) }, { status: 502 });
  }
  return NextResponse.json(
    { status: 'preparing' },
    { status: 202, headers: { 'cache-control': 'no-store' } }
  );
}
