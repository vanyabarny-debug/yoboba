import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { build_order_status_push } from '@/lib/order-push-copy';
import { is_supabase_configured } from '@/lib/supabase/config';
import type { order } from '@/lib/types';

function service_client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** push клиенту при смене статуса — приходит даже если PWA закрыта */
export async function push_order_status_to_user(order: order) {
  if (!is_supabase_configured() || !order.user_id) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const public_key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const private_key = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!public_key || !private_key || !subject) return;

  webpush.setVapidDetails(subject, public_key, private_key);

  const supabase = service_client();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', order.user_id);

  if (!subs?.length) return;

  const copy = build_order_status_push(order);
  const payload = JSON.stringify({
    title: copy.title,
    body: copy.body,
    tag: copy.tag,
    renotify: copy.renotify,
    requireInteraction: copy.requireInteraction,
    vibrate: copy.vibrate,
    data: copy.data,
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
    } catch {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    }
  }
}
