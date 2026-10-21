import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';

import { find_seller_by_credentials } from '@/lib/sellers-server';
import { client_ip, note_staff_login_failure, staff_login_blocked } from '@/lib/login-rate-limit';
import { apply_staff_cookies } from '@/lib/staff-session';

export async function POST(request: Request) {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  if (role !== 'seller' && role !== 'admin') {
    return NextResponse.json({ error: 'сначала войдите в кассу' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    login?: unknown;
    password?: unknown;
  } | null;

  if (body?.action === 'lock') {
    const res = NextResponse.json({ ok: true, locked: true });
    const next_role = role === 'admin' ? 'admin' : 'seller';
    if (!(await apply_staff_cookies(res, { role: next_role }))) {
      return NextResponse.json({ error: 'не удалось закрыть смену' }, { status: 500 });
    }
    return res;
  }

  const login = typeof body?.login === 'string' ? body.login.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!login || !password) {
    return NextResponse.json({ error: 'нужны логин и пароль бариста' }, { status: 400 });
  }

  const ip = client_ip(request);
  if (staff_login_blocked(ip, login)) {
    return NextResponse.json({ error: 'слишком много попыток, подождите 10 минут' }, { status: 429 });
  }

  const seller = await find_seller_by_credentials(login, password);
  if (!seller) {
    note_staff_login_failure(ip, login);
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    seller_id: seller.id,
    name: seller.name,
    spot_ids: seller.spot_ids ?? [],
    access: seller.access ?? null,
  });
  if (!(await apply_staff_cookies(res, { role: 'seller', seller_id: seller.id, name: seller.name }))) {
    return NextResponse.json({ error: 'вход временно недоступен' }, { status: 500 });
  }
  return res;
}
