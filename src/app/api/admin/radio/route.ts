import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { discard_radio_file } from '@/lib/radio-cache';
import { list_source_entries } from '@/lib/radio-ytdlp';
import {
  clean_media_url,
  new_track_id,
  radio_track_limit,
  read_radio,
  write_radio,
  type radio_track,
} from '@/lib/radio-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const source = await read_radio();
  return NextResponse.json({ tracks: source.tracks });
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const page_url = clean_media_url(body?.url);
  if (!page_url) {
    return NextResponse.json({ error: 'нужна ссылка http или https' }, { status: 400 });
  }

  const listed = await list_source_entries(page_url, request.signal);
  if (!listed.ok) {
    return NextResponse.json({ error: listed.error }, { status: 502 });
  }

  const source = await read_radio();
  const known = new Set(source.tracks.map((track) => track.url));
  const added: radio_track[] = [];
  for (const entry of listed.entries) {
    if (known.has(entry.url)) continue;
    if (source.tracks.length + added.length >= radio_track_limit) break;
    known.add(entry.url);
    added.push({ id: new_track_id(), url: entry.url, title: entry.title, duration: entry.duration });
  }
  if (!added.length) {
    return NextResponse.json({ error: 'эти ссылки уже в источнике' }, { status: 400 });
  }

  const tracks = await write_radio({ tracks: [...source.tracks, ...added] });
  return NextResponse.json({ ok: true, added: added.length, tracks: tracks.tracks });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'нет id' }, { status: 400 });
  const source = await read_radio();
  discard_radio_file(id);
  const tracks = source.tracks.filter((track) => track.id !== id);
  if (tracks.length === source.tracks.length) {
    return NextResponse.json({ error: 'такой ссылки нет' }, { status: 404 });
  }
  const saved = await write_radio({ tracks });
  return NextResponse.json({ ok: true, tracks: saved.tracks });
}
