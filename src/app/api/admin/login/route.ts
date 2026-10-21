import { NextResponse } from 'next/server';
import { record_admin_login, verify_admin_login } from '@/lib/admin-account-server';
import { client_ip, note_staff_login_failure, staff_login_blocked } from '@/lib/login-rate-limit';
import { apply_staff_cookies, clear_staff_cookies } from '@/lib/staff-session';

export async function POST(request: Request) {
  const { login, password } = await request.json();
  const name = String(login || '');
  const ip = client_ip(request);
  if (staff_login_blocked(ip, name)) {
    return NextResponse.json({ error: 'слишком много попыток, подождите 10 минут' }, { status: 429 });
  }

  if (!(await verify_admin_login(name, password || ''))) {
    note_staff_login_failure(ip, name);
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  await record_admin_login(request).catch((error) =>
    console.error('admin login history', error instanceof Error ? error.message : error)
  );

  const res = NextResponse.json({ ok: true });
  if (!(await apply_staff_cookies(res, { role: 'admin', name: 'админ' }))) {
    return NextResponse.json({ error: 'вход временно недоступен' }, { status: 500 });
  }
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clear_staff_cookies(res);
  return res;
}
