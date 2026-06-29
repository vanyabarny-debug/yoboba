import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  check_admin_credentials,
  session_cookie,
  seller_id_cookie,
  seller_name_cookie,
  type user_role,
} from '@/lib/session';
import { find_seller_by_credentials } from '@/lib/sellers-server';

const allowed_roles: user_role[] = ['guest', 'user', 'admin', 'barista', 'seller'];
const staff_roles: user_role[] = ['admin', 'barista', 'seller'];

const cookie_opts = {
  httpOnly: true,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
  sameSite: 'lax' as const,
};

const debug_log_path = join(process.cwd(), '.cursor/debug-470d82.log');

function server_agent_log(payload: Record<string, unknown>) {
  try {
    const dir = join(process.cwd(), '.cursor');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      debug_log_path,
      `${JSON.stringify({ sessionId: '470d82', timestamp: Date.now(), ...payload })}\n`,
      'utf-8'
    );
  } catch {
    /* ignore */
  }
}

async function current_role() {
  const store = await cookies();
  return store.get(session_cookie)?.value as user_role | undefined;
}

export async function GET() {
  const role = await current_role();
  const store = await cookies();
  return NextResponse.json({
    role: role || null,
    seller_id: store.get(seller_id_cookie)?.value || null,
    name: store.get(seller_name_cookie)?.value || null,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const existing = await current_role();

  // #region agent log
  server_agent_log({
    location: 'api/auth/session/route.ts:POST',
    message: 'session POST',
    data: {
      hasLogin: body.login !== undefined,
      hasPassword: body.password !== undefined,
      roleOnly: body.role,
      existingRole: existing || null,
    },
    hypothesisId: 'H3',
  });
  // #endregion

  if (body.login !== undefined && body.password !== undefined) {
    const login = String(body.login).trim();
    const password = String(body.password);

    if (check_admin_credentials(login, password)) {
      const res = NextResponse.json({ ok: true, role: 'admin' as user_role, name: 'админ' });
      res.cookies.set(session_cookie, 'admin', cookie_opts);
      res.cookies.set(seller_id_cookie, '', { ...cookie_opts, maxAge: 0 });
      res.cookies.set(seller_name_cookie, '', { ...cookie_opts, maxAge: 0 });
      res.cookies.set('yoboba_admin', '', { ...cookie_opts, maxAge: 0 });
      return res;
    }

    const seller = await find_seller_by_credentials(login, password);
    if (seller) {
      const res = NextResponse.json({
        ok: true,
        role: 'seller' as user_role,
        seller_id: seller.id,
        name: seller.name,
      });
      res.cookies.set(session_cookie, 'seller', cookie_opts);
      res.cookies.set(seller_id_cookie, seller.id, cookie_opts);
      res.cookies.set(seller_name_cookie, seller.name, cookie_opts);
      return res;
    }

    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  const role = body.role as user_role;
  if (!allowed_roles.includes(role)) {
    return NextResponse.json({ error: 'неверная роль' }, { status: 400 });
  }

  // не сбрасывать сессию персонала при входе гостя с сайта
  if (
    existing &&
    staff_roles.includes(existing) &&
    !staff_roles.includes(role)
  ) {
    return NextResponse.json({ ok: true, role: existing, protected: true });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(session_cookie, role, cookie_opts);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(session_cookie, '', { ...cookie_opts, maxAge: 0 });
  res.cookies.set(seller_id_cookie, '', { ...cookie_opts, maxAge: 0 });
  res.cookies.set(seller_name_cookie, '', { ...cookie_opts, maxAge: 0 });
  res.cookies.set('yoboba_admin', '', { ...cookie_opts, maxAge: 0 });
  return res;
}
