import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { hash_staff_password, min_staff_password_length } from '@/lib/password-hash';
import { delete_seller, get_sellers, upsert_seller } from '@/lib/sellers-server';
import { parse_push_categories } from '@/lib/push-categories';
import { parse_seller_access } from '@/lib/seller-access';
import { parse_schedule, seller_month_pay } from '@/lib/staff-schedule';
import { open_staff_password, seal_staff_password } from '@/lib/staff-password-vault';
import { moscow_today_iso } from '@/lib/order-number';
import type { seller } from '@/lib/types';

function clean_text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clean_day(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

function public_seller(row: seller): seller {
  const { password_view, ...rest } = row;
  return { ...rest, password: '', password_known: Boolean(open_staff_password(password_view)) };
}

export async function GET(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const sellers = await get_sellers();
  const reveal = new URL(request.url).searchParams.get('reveal');
  if (reveal) {
    const row = sellers.find((s) => s.id === reveal);
    if (!row) return NextResponse.json({ error: 'не найден' }, { status: 404 });
    return NextResponse.json({ password: open_staff_password(row.password_view) });
  }
  return NextResponse.json({ sellers: sellers.map(public_seller) });
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

  const shift_rate = Math.max(0, Math.round(Number(body.shift_rate) || 0));
  const schedule = parse_schedule(body.schedule);
  const salary_net = seller_month_pay(
    { salary_net: body.salary_net, shift_rate, schedule },
    moscow_today_iso().slice(0, 7)
  );
  const password_view = incoming ? seal_staff_password(incoming) : existing?.password_view;
  const with_ndfl =
    body.with_ndfl != null ? Boolean(body.with_ndfl) : salary_net > 0;
  const push_categories = parse_push_categories(body.push_categories);
  const access = parse_seller_access(body.access);
  access.push = push_categories.length > 0;
  const record = await upsert_seller({
    id: body.id || `seller-${Date.now()}`,
    created_at: existing?.created_at,
    login: body.login.trim().toLowerCase(),
    password,
    password_view,
    name: body.name.trim(),
    role_title: (body.role_title || 'бариста').trim().slice(0, 40) || 'бариста',
    access,
    push_categories,
    is_active: body.is_active !== false,
    spot_ids: Array.isArray(body.spot_ids) ? body.spot_ids : [],
    salary_net,
    with_ndfl,
    shift_rate,
    phone: clean_text(body.phone, 32),
    birthday: clean_day(body.birthday),
    hired_at: clean_day(body.hired_at),
    note: clean_text(body.note, 600),
    schedule,
  }).catch((e: unknown) => {
    console.error('sellers save', e instanceof Error ? e.message : e);
    return null;
  });
  if (!record) {
    return NextResponse.json({ error: 'не удалось сохранить — supabase не ответил' }, { status: 502 });
  }

  return NextResponse.json({ seller: public_seller(record) });
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'не указан id' }, { status: 400 });
  }

  const removed = await delete_seller(id).catch((e: unknown) => {
    console.error('sellers delete', e instanceof Error ? e.message : e);
    return 'fail' as const;
  });
  if (removed === 'fail') {
    return NextResponse.json({ error: 'не удалось удалить — supabase не ответил' }, { status: 502 });
  }
  if (!removed) {
    return NextResponse.json({ error: 'не найден' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
