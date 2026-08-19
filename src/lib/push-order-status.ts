import { build_order_status_push } from '@/lib/order-push-copy';
import { send_push_to_user_id } from '@/lib/push-server';
import type { order } from '@/lib/types';

/** push клиенту при смене статуса — приходит даже если PWA закрыта */
export async function push_order_status_to_user(order: order) {
  if (!order.user_id) return;
  const copy = build_order_status_push(order);
  await send_push_to_user_id(order.user_id, {
    title: copy.title,
    body: copy.body,
    tag: copy.tag,
    renotify: copy.renotify,
    requireInteraction: copy.requireInteraction,
    vibrate: copy.vibrate,
    data: copy.data,
  });
}
