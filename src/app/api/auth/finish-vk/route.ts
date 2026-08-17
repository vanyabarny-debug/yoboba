import { NextResponse, type NextRequest } from 'next/server';
import { read_pending_vk_session } from '@/lib/vk-pending-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const id = request.cookies.get('vk_pending')?.value?.trim() || '';
  const session = id ? await read_pending_vk_session(id) : null;

  return NextResponse.json(
    session
      ? { ok: true, session }
      : { ok: false, session: null }
  );
}
