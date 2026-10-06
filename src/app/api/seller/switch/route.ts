import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  session_cookie,
  seller_id_cookie,
  seller_name_cookie,
} from '@/lib/session';
import { find_seller_by_credentials } from '@/lib/sellers-server';

const cookie_opts = {
  httpOnly: true,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
  sameSite: 'lax' as const,
};

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
    res.cookies.set(seller_id_cookie, '', { ...cookie_opts, maxAge: 0 });
    res.cookies.set(seller_name_cookie, '', { ...cookie_opts, maxAge: 0 });
    return res;
  }

  const login = typeof body?.login === 'string' ? body.login.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!login || !password) {
    return NextResponse.json({ error: 'нужны логин и пароль бариста' }, { status: 400 });
  }

  const seller = await find_seller_by_credentials(login, password);
  if (!seller) {
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    seller_id: seller.id,
    name: seller.name,
    spot_ids: seller.spot_ids ?? [],
    access: seller.access ?? null,
  });
  res.cookies.set(session_cookie, 'seller', cookie_opts);
  res.cookies.set(seller_id_cookie, seller.id, cookie_opts);
  res.cookies.set(seller_name_cookie, seller.name, cookie_opts);
  return res;
}
