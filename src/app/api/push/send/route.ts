import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { NextResponse } from 'next/server';
import { create_server_client } from '@/lib/supabase/server';

function get_service_client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase_auth = await create_server_client();
  const { data: { user } } = await supabase_auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'не авторизован' }, { status: 401 });
  }

  const { data: profile } = await supabase_auth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'доступ запрещён' }, { status: 403 });
  }

  const { title, body } = await request.json();
  if (!title || !body) {
    return NextResponse.json({ error: 'нужны title и body' }, { status: 400 });
  }

  const public_key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const private_key = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!public_key || !private_key || !subject) {
    return NextResponse.json({ error: 'vapid не настроен' }, { status: 500 });
  }

  webpush.setVapidDetails(subject, public_key, private_key);

  const supabase = get_service_client();
  const { data: subs } = await supabase.from('push_subscriptions').select('*');

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ title, body })
      );
      sent++;
    } catch {
      // удаляем протухшие подписки
      await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    }
  }

  return NextResponse.json({ sent, total: subs?.length || 0 });
}
