import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  get_opening_100_status,
  set_opening_100_counter,
} from '@/lib/opening-100-server';
import { staff_actor_name } from '@/lib/student-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  return NextResponse.json(await get_opening_100_status());
}

export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    remaining?: number;
    limit?: number;
  };

  const remaining = typeof body.remaining === 'number' ? body.remaining : null;
  const limit = typeof body.limit === 'number' ? body.limit : null;
  if (remaining === null && limit === null) {
    return NextResponse.json({ error: 'укажите остаток или лимит' }, { status: 400 });
  }
  if (remaining !== null && (!Number.isFinite(remaining) || remaining < 0)) {
    return NextResponse.json({ error: 'остаток не может быть меньше нуля' }, { status: 400 });
  }
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    return NextResponse.json({ error: 'лимит должен быть больше нуля' }, { status: 400 });
  }

  const status = await set_opening_100_counter({
    remaining,
    limit,
    by: await staff_actor_name(),
  });
  return NextResponse.json(status);
}
