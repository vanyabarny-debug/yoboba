import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_radio } from '@/lib/radio-server';

export const dynamic = 'force-dynamic';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function GET() {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const source = await read_radio();
  return NextResponse.json({
    tracks: source.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      duration: track.duration,
    })),
  });
}
