import { build_order_status_push } from '@/lib/order-push-copy';
import type { order } from '@/lib/types';

async function get_sw_registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
  } catch {
    return null;
  }
}

/** локальное уведомление со статусом */
export async function notify_order_status(order: order) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  const payload = build_order_status_push(order);

  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag,
      renotify: payload.renotify,
      requireInteraction: payload.requireInteraction,
      vibrate: payload.vibrate,
      data: payload.data,
    };

    const reg = await get_sw_registration();
    if (reg?.showNotification) {
      await reg.showNotification(payload.title, options);
      return;
    }

    const n = new Notification(payload.title, options);
    n.onclick = () => {
      window.focus();
      window.location.href = payload.data.url;
      n.close();
    };
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
