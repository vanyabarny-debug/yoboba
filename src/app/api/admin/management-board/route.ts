import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_management_board, write_management_board } from '@/lib/management-board-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const payload = await read_management_board();
  return NextResponse.json(payload, { headers: { 'cache-control': 'private, no-store' } });
}

export async function PUT(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { store?: unknown } | null;
  const payload = await write_management_board(body?.store);
  return NextResponse.json(payload);
}
