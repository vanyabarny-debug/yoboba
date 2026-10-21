import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  session_cookie,
  seller_id_cookie,
  seller_name_cookie,
  type user_role,
} from '@/lib/session';
import { record_admin_login, verify_admin_login } from '@/lib/admin-account-server';
import { verify_pos_login } from '@/lib/pos-account-server';
import { find_seller_by_credentials } from '@/lib/sellers-server';
import { client_ip, note_staff_login_failure, staff_login_blocked } from '@/lib/login-rate-limit';
import { apply_staff_cookies, base_cookie_options, clear_staff_cookies, staff_proof_cookie } from '@/lib/staff-session';

const allowed_roles: user_role[] = ['guest', 'user', 'admin', 'barista', 'seller'];
const staff_roles: user_role[] = ['admin', 'barista', 'seller'];

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
    const ip = client_ip(request);
    if (staff_login_blocked(ip, login)) {
      return NextResponse.json(
        { error: 'слишком много попыток, подождите 10 минут' },
        { status: 429 }
      );
    }

    if (await verify_admin_login(login, password)) {
      await record_admin_login(request).catch((error) =>
        console.error('admin login history', error instanceof Error ? error.message : error)
      );
      const res = NextResponse.json({ ok: true, role: 'admin' as user_role, name: 'админ' });
      if (!(await apply_staff_cookies(res, { role: 'admin', name: 'админ' }))) {
        return NextResponse.json({ error: 'вход временно недоступен' }, { status: 500 });
      }
      return res;
    }

    // общий вход в кассу: без конкретного бариста
    if (await verify_pos_login(login, password)) {
      const res = NextResponse.json({
        ok: true,
        role: 'seller' as user_role,
        pos: true,
        seller_id: null,
        name: null,
        spot_ids: [] as string[],
      });
      if (!(await apply_staff_cookies(res, { role: 'seller' }))) {
        return NextResponse.json({ error: 'вход временно недоступен' }, { status: 500 });
      }
      return res;
    }

    const seller = await find_seller_by_credentials(login, password);
    if (seller) {
      const res = NextResponse.json({
        ok: true,
        role: 'seller' as user_role,
        pos: true,
        seller_id: seller.id,
        name: seller.name,
        spot_ids: seller.spot_ids ?? [],
      });
      if (!(await apply_staff_cookies(res, { role: 'seller', seller_id: seller.id, name: seller.name }))) {
        return NextResponse.json({ error: 'вход временно недоступен' }, { status: 500 });
      }
      return res;
    }

    note_staff_login_failure(ip, login);
    return NextResponse.json({ error: 'неверный логин или пароль' }, { status: 401 });
  }

  const role = body.role as user_role;
  if (!allowed_roles.includes(role)) {
    return NextResponse.json({ error: 'неверная роль' }, { status: 400 });
  }

  if (staff_roles.includes(role)) {
    return NextResponse.json({ error: 'нужны логин и пароль' }, { status: 401 });
  }

  // не сбрасывать сессию персонала при входе гостя с сайта
  if (existing && staff_roles.includes(existing)) {
    return NextResponse.json({ ok: true, role: existing, protected: true });
  }

  const res = NextResponse.json({ ok: true, role });
  const cookie_opts = base_cookie_options();
  res.cookies.set(session_cookie, role, cookie_opts);
  res.cookies.set(staff_proof_cookie, '', { ...cookie_opts, maxAge: 0 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clear_staff_cookies(res);
  return res;
}
