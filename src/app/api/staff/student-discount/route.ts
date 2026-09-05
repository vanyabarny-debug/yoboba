import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { session_cookie } from '@/lib/session';
import { normalize_phone } from '@/lib/phone';
import { set_student_verified, staff_actor_name } from '@/lib/student-server';

async function is_staff() {
  const store = await cookies();
  const role = store.get(session_cookie)?.value;
  return role === 'admin' || role === 'seller';
}

export async function POST(request: Request) {
  if (!(await is_staff())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
    phone?: string;
    verified?: boolean;
  };

  const user_id = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const phone = normalize_phone(body.phone);
  if (!user_id && !phone) {
    return NextResponse.json({ error: 'укажите клиента' }, { status: 400 });
  }

  const status = await set_student_verified({
    user_id: user_id || null,
    phone,
    verified: body.verified !== false,
    by: await staff_actor_name(),
  });

  return NextResponse.json({ ok: true, ...status });
}
