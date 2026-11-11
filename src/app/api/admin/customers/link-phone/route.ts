import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { claim_phone_for_user } from '@/lib/bonus-server';
import { normalize_phone } from '@/lib/phone';
import { session_cookie } from '@/lib/session';
import { create_service_client } from '@/lib/supabase/service';

async function is_admin() {
  const store = await cookies();
  return store.get(session_cookie)?.value === 'admin';
}

/** вручную: vk без номера забирает аккаунт, где был только телефон */
export async function POST(request: Request) {
  if (!(await is_admin())) {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    user_id?: unknown;
    phone?: unknown;
  } | null;
  const user_id = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  const phone = normalize_phone(typeof body?.phone === 'string' ? body.phone : null);
  if (!/^[0-9a-f-]{36}$/i.test(user_id)) {
    return NextResponse.json({ error: 'у этого гостя нет аккаунта' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: 'укажите номер полностью' }, { status: 400 });
  }

  const claimed = await claim_phone_for_user({
    user_id,
    phone,
    actor: 'админ',
    allow_phone_account: true,
  });
  if (!claimed.ok) {
    return NextResponse.json({ error: claimed.error }, { status: claimed.status });
  }

  const admin = create_service_client();
  const { data: auth_user } = await admin.auth.admin.getUserById(user_id);
  const meta = (auth_user?.user?.user_metadata || {}) as Record<string, unknown>;
  const updated = await admin.auth.admin.updateUserById(user_id, {
    phone,
    phone_confirm: true,
    user_metadata: { ...meta, phone },
  });
  if (updated.error) {
    console.warn('[link-phone] auth phone', updated.error.message);
  }

  return NextResponse.json({
    ok: true,
    phone,
    linked_purchases: claimed.linked_purchases,
    bonus_balance: claimed.bonus_balance,
  });
}
