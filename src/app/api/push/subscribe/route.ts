import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';

function get_service_client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'supabase не настроен' }, { status: 500 });
  }

  let user_id = typeof body.user_id === 'string' ? body.user_id : null;
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

  const supabase = get_service_client();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id, endpoint, p256dh, auth },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id });
}
