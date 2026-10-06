import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { read_pos_account_public, update_pos_account } from '@/lib/pos-account-server';

export const dynamic = 'force-dynamic';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin' || store.get('yoboba_admin')?.value === '1';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  return NextResponse.json(await read_pos_account_public());
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    current_password?: unknown;
    login?: unknown;
    new_password?: unknown;
  } | null;
  if (!body || typeof body.current_password !== 'string' || typeof body.login !== 'string') {
    return NextResponse.json({ error: 'нужны текущий пароль и логин' }, { status: 400 });
  }

  const result = await update_pos_account({
    current_password: body.current_password,
    login: body.login,
    new_password: typeof body.new_password === 'string' ? body.new_password : '',
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, login: result.login });
}
