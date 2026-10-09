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
    expires_at?: string;
  };

  const user_id = typeof body.user_id === 'string' ? body.user_id.trim() : '';
  const phone = normalize_phone(body.phone);
  if (!user_id && !phone) {
    return NextResponse.json({ error: 'укажите клиента' }, { status: 400 });
  }

  const verified = body.verified !== false;
  const expires_raw =
    typeof body.expires_at === 'string' ? body.expires_at.trim().slice(0, 10) : '';
  if (verified && expires_raw && !/^\d{4}-\d{2}-\d{2}$/.test(expires_raw)) {
    return NextResponse.json({ error: 'неверная дата окончания студенческого' }, { status: 400 });
  }

  const status = await set_student_verified({
    user_id: user_id || null,
    phone,
    verified,
    by: await staff_actor_name(),
    expires_at: verified ? expires_raw || null : null,
  });

  return NextResponse.json({ ok: true, ...status });
}
