import { NextResponse } from 'next/server';
import { record_admin_login, verify_admin_login } from '@/lib/admin-account-server';

export async function POST(request: Request) {
  const { login, password } = await request.json();

  if (!(await verify_admin_login(login || '', password || ''))) {
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  await record_admin_login(request).catch((error) =>
    console.error('admin login history', error instanceof Error ? error.message : error)
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set('yoboba_admin', '1', {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('yoboba_admin', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
