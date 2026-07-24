'use client';

import { useEffect } from 'react';

export default function pwa_register() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      return;
    }

    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((err) => console.error('sw register error:', err));
  }, []);

  return null;
}

async function resolve_vapid_public_key(): Promise<string | null> {
  const baked = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (baked && baked.length > 20 && !baked.includes('your-vapid')) return baked;

  try {
    const res = await fetch('/api/push/vapid', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const body = (await res.json()) as { publicKey?: string | null; configured?: boolean };
    if (!body.configured || !body.publicKey) return null;
    return body.publicKey;
  } catch {
    return null;
  }
}

export async function subscribe_to_push(user_id?: string) {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
  }
  if (Notification.permission !== 'granted') return null;

  const vapid_key = await resolve_vapid_public_key();
  if (!vapid_key) {
    console.warn('[push] vapid public key missing — проверьте .env и rebuild');
    return null;
  }

  // дождаться SW (на iOS PWA критично)
  let registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register('/service-worker.js');
    } catch {
      return null;
    }
  }
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: url_base64_to_uint8(vapid_key),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      user_id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  });

  if (!res.ok) {
    console.warn('[push] subscribe save failed', await res.text());
    return null;
  }

  return subscription;
}

function url_base64_to_uint8(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64_clean = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64_clean);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}
