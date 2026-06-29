import { NextResponse } from 'next/server';
import { check_admin_credentials } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const { login, password } = await request.json();

  if (!check_admin_credentials(login || '', password || '')) {
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

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
