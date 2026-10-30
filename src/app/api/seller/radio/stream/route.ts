import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_radio, write_radio } from '@/lib/radio-server';
import { open_mp3_stream, resolve_stream_target } from '@/lib/radio-ytdlp';

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
  const id = url.searchParams.get('id') || '';
  const start_raw = Number(url.searchParams.get('start'));
  const start = Number.isFinite(start_raw) ? Math.min(Math.max(start_raw, 0), 60 * 60 * 24) : 0;
  const source = await read_radio();
  const track = source.tracks.find((item) => item.id === id);
  if (!track) {
    return NextResponse.json({ error: 'нет такой ссылки' }, { status: 404 });
  }
  const target = await resolve_stream_target(track.url, request.signal);
  if (!target.ok) {
    return NextResponse.json({ error: 'не удалось включить поток' }, { status: 502 });
  }
  if (request.signal.aborted) {
    return new Response(null, { status: 499 });
  }
  if (target.duration && target.duration !== track.duration) {
    await write_radio({
      tracks: source.tracks.map((item) => (item.id === track.id ? { ...item, duration: target.duration } : item)),
    });
  }
  const at = target.duration ? Math.min(start, Math.max(0, target.duration - 0.4)) : start;
  return open_mp3_stream(target.media_url, target.headers, request.signal, at);
}
