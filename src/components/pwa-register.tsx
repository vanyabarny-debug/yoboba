'use client';

import { useEffect } from 'react';

export default function pwa_register() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/service-worker.js')
      .catch((err) => console.error('sw register error:', err));
  }, []);

  return null;
}

export async function subscribe_to_push(user_id?: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;

  const registration = await navigator.serviceWorker.ready;
  const vapid_key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid_key) return null;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: url_base64_to_uint8(vapid_key),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      user_id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  });

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
