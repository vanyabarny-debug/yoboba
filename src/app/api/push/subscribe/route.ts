import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';
import { is_supabase_configured } from '@/lib/supabase/config';
import { upsert_push_subscription } from '@/lib/push-server';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
    endpoint?: string;
    p256dh?: string;
    auth?: string;
  };
  const { endpoint, p256dh, auth } = body;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'неполные данные подписки' }, { status: 400 });
  }

  let user_id = typeof body.user_id === 'string' ? body.user_id : null;
  if (is_supabase_configured()) {
    try {
      const supabase_auth = await create_server_client();
      const {
        data: { user },
      } = await supabase_auth.auth.getUser();
      if (user && !user.is_anonymous) {
        user_id = user.id;
      }
    } catch {
      /* leave body user_id */
    }
  }

  try {
    await upsert_push_subscription({
      user_id,
      endpoint,
      p256dh,
      auth,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось сохранить подписку';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id });
}
