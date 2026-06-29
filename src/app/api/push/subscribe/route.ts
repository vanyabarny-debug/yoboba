import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function get_service_client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { user_id, endpoint, p256dh, auth } = body;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'неполные данные подписки' }, { status: 400 });
  }

  const supabase = get_service_client();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user_id || null, endpoint, p256dh, auth },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
