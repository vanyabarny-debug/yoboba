import { NextResponse, type NextRequest } from 'next/server';
import { take_pending_vk_session } from '@/lib/vk-pending-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const id = request.cookies.get('vk_pending')?.value?.trim() || '';
  const session = id ? await take_pending_vk_session(id) : null;

  const res = NextResponse.json(
    session
      ? { ok: true, session }
      : { ok: false, session: null }
  );
  res.cookies.set('vk_pending', '', { maxAge: 0, path: '/' });
  return res;
}
