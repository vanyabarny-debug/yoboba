import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_management_board } from '@/lib/management-board-server';

export async function GET() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'admin' && role !== 'seller') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const payload = await read_management_board();
  return NextResponse.json(payload, { headers: { 'cache-control': 'private, no-store' } });
}
