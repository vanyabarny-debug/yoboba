import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import {
  delete_intern,
  intern_statuses,
  list_interns,
  set_intern_status,
  type intern_status,
} from '@/lib/study/interns-server';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

export async function GET() {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  return NextResponse.json({ interns: await list_interns() });
}

export async function PATCH(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string };
  const id = typeof body.id === 'string' ? body.id : '';
  const status = body.status as intern_status;
  if (!id) return NextResponse.json({ error: 'не указан id' }, { status: 400 });
  if (!intern_statuses.includes(status)) {
    return NextResponse.json({ error: 'неизвестный статус' }, { status: 400 });
  }
  try {
    const intern = await set_intern_status(id, status);
    if (!intern) return NextResponse.json({ error: 'не найден' }, { status: 404 });
    return NextResponse.json({ intern });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'не указан id' }, { status: 400 });
  try {
    if (!(await delete_intern(id))) {
      return NextResponse.json({ error: 'не найден' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось удалить';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
