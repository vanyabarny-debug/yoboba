import { NextResponse } from 'next/server';
import { check_staff_credentials, session_cookie, type user_role } from '@/lib/session';

const allowed_roles: user_role[] = ['guest', 'user', 'admin', 'barista'];

export async function POST(request: Request) {
  const body = await request.json();

  if (body.login !== undefined && body.password !== undefined) {
    if (!check_staff_credentials(body.login, body.password)) {
      return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: 'admin' });
    res.cookies.set(session_cookie, 'admin', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24,
      sameSite: 'lax',
    });
    res.cookies.set('yoboba_admin', '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  }

  const role = body.role as user_role;
  if (!allowed_roles.includes(role)) {
    return NextResponse.json({ error: 'неверная роль' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(session_cookie, role, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(session_cookie, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set('yoboba_admin', '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
