import { BRAND_NAME } from '@/lib/brand';
import { format_order_number } from '@/lib/order-number';
import { order_status_ui } from '@/lib/active-order-store';
import type { order } from '@/lib/types';

/** локальное уведомление со статусом (видно и на экране блокировки как notification) */
export async function notify_order_status(order: order) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const ui = order_status_ui[order.status];
  const num = format_order_number(order);
  const title = `${BRAND_NAME} · № ${num}`;
  const body =
    order.status === 'ready'
      ? 'заказ готов — можно забирать!'
      : `${ui.title}: ${ui.hint}`;

  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const options: NotificationOptions & { renotify?: boolean } = {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `yoboba-order-${order.id}`,
      renotify: true,
      requireInteraction: order.status === 'ready',
      data: { url: `/orders/${order.id}`, order_id: order.id, status: order.status },
    };
    await reg.showNotification(title, options);
  } catch {
    /* ignore */
  }
}

export async function ensure_order_notify_permission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}
