import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { hash_staff_password, min_staff_password_length } from '@/lib/password-hash';
import { delete_seller, get_sellers, upsert_seller } from '@/lib/sellers-server';
import { parse_push_categories } from '@/lib/push-categories';
import { parse_seller_access } from '@/lib/seller-access';
import type { seller } from '@/lib/types';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const sellers = await get_sellers();
  return NextResponse.json({
    sellers: sellers.map((seller) => ({ ...seller, password: '' })),
  });
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json()) as seller;
  if (!body.login?.trim() || !body.name?.trim()) {
    return NextResponse.json({ error: 'заполните имя и логин' }, { status: 400 });
  }

  const login = body.login.trim().toLowerCase();
  const sellers = await get_sellers();
  const duplicate = sellers.find(
    (s) => s.login.toLowerCase() === login && s.id !== body.id
  );
  if (duplicate) {
    return NextResponse.json({ error: 'такой логин уже есть' }, { status: 409 });
  }

  const { read_admin_account_public } = await import('@/lib/admin-account-server');
  const { read_pos_account_public } = await import('@/lib/pos-account-server');
  const [admin, pos] = await Promise.all([
    read_admin_account_public(),
    read_pos_account_public(),
  ]);
  if (admin.login.toLowerCase() === login) {
    return NextResponse.json({ error: 'такой логин уже у админа' }, { status: 409 });
  }
  if (pos.login.toLowerCase() === login) {
    return NextResponse.json({ error: 'такой логин уже у общего входа в кассу' }, { status: 409 });
  }

  const existing = sellers.find((s) => s.id === body.id);
  const incoming = typeof body.password === 'string' ? body.password : '';
  let password = '';
  if (!incoming) {
    if (!existing?.password) {
      return NextResponse.json({ error: 'укажите пароль' }, { status: 400 });
    }
    password = existing.password;
  } else if (incoming.length < min_staff_password_length) {
    return NextResponse.json({ error: 'пароль короче 8 символов' }, { status: 400 });
  } else {
    password = hash_staff_password(incoming);
  }

  const salary_net = Math.max(0, Math.round(Number(body.salary_net) || 0));
  const with_ndfl =
    body.with_ndfl != null ? Boolean(body.with_ndfl) : salary_net > 0;
  const push_categories = parse_push_categories(body.push_categories);
  const access = parse_seller_access(body.access);
  access.push = push_categories.length > 0;
  const record = await upsert_seller({
    id: body.id || `seller-${Date.now()}`,
    login: body.login.trim().toLowerCase(),
    password,
    name: body.name.trim(),
    role_title: (body.role_title || 'бариста').trim().slice(0, 40) || 'бариста',
    access,
    push_categories,
    is_active: body.is_active !== false,
    spot_ids: Array.isArray(body.spot_ids) ? body.spot_ids : [],
    salary_net,
    with_ndfl,
  });

  return NextResponse.json({ seller: { ...record, password: '' } });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'не указан id' }, { status: 400 });
  }

  if (!(await delete_seller(id))) {
    return NextResponse.json({ error: 'не найден' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
