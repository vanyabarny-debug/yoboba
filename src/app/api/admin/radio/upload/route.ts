import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, truncateSync, writeFileSync } from 'fs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  kick_radio_file,
  radio_cache_dir,
  radio_src_path,
  radio_upload_path,
  safe_track_id,
} from '@/lib/radio-cache';
import { probe_upload } from '@/lib/radio-ytdlp';
import { file_track_url, radio_track_limit, read_radio, write_radio, type radio_track } from '@/lib/radio-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** nginx по умолчанию пускает до 1 МБ — клиент режет файл мельче */
const chunk_limit = 1024 * 1024;
const file_limit = 600 * 1024 * 1024;

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
}

function title_from_name(name: string) {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'запись').slice(0, 180);
}

function whole(raw: string | null) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const url = new URL(request.url);
  const id = safe_track_id(url.searchParams.get('id') || '');
  const offset = whole(url.searchParams.get('offset'));
  const total = whole(url.searchParams.get('total'));
  const name = (url.searchParams.get('name') || '').slice(0, 240);
  const upload = id ? radio_upload_path(id) : null;
  const src = id ? radio_src_path(id) : null;
  if (!id || !upload || !src || offset < 0 || total <= 0) {
    return NextResponse.json({ error: 'плохой запрос' }, { status: 400 });
  }
  if (total > file_limit) {
    return NextResponse.json({ error: 'файл больше 600 МБ' }, { status: 413 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > chunk_limit || offset + body.length > total) {
    return NextResponse.json({ error: 'кусок файла не того размера' }, { status: 400 });
  }

  mkdirSync(radio_cache_dir(), { recursive: true });
  if (offset === 0) {
    const source = await read_radio();
    if (source.tracks.length >= radio_track_limit) {
      return NextResponse.json({ error: `в источнике уже ${radio_track_limit} треков` }, { status: 400 });
    }
    if (source.tracks.some((track) => track.id === id)) {
      return NextResponse.json({ error: 'этот файл уже загружен' }, { status: 409 });
    }
    writeFileSync(upload, body);
  } else {
    const have = existsSync(upload) ? statSync(upload).size : -1;
    if (have < offset) {
      return NextResponse.json({ error: 'загрузка прервалась — начните заново', offset: Math.max(0, have) }, { status: 409 });
    }
    if (have > offset) truncateSync(upload, offset);
    appendFileSync(upload, body);
  }

  const received = offset + body.length;
  if (received < total) return NextResponse.json({ received });

  renameSync(upload, src);
  const probe = await probe_upload(src);
  if (!probe.ok) {
    rmSync(src, { force: true });
    return NextResponse.json({ error: probe.error }, { status: 400 });
  }

  const track: radio_track = {
    id,
    url: file_track_url(name || 'запись'),
    title: title_from_name(name),
    duration: probe.duration,
    source: 'file',
  };
  const source = await read_radio();
  const saved = await write_radio({ tracks: [...source.tracks, track] });
  kick_radio_file(track, false);
  return NextResponse.json({ ok: true, received, tracks: saved.tracks });
}
