'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { subscribe_to_push } from '@/components/pwa-register';
import { get_demo_user } from '@/lib/demo-auth';
import { get_auth_state } from '@/lib/auth';
import { is_supabase_configured } from '@/lib/supabase/config';

const choice_key = 'yoboba_notify_choice';
const splash_key = 'yoboba_splash_seen';

function staff_path(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/barista') ||
    pathname.startsWith('/squad')
  );
}

function notifications_available() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function our_choice(): 'allow' | 'deny' | null {
  try {
    const raw = localStorage.getItem(choice_key);
    if (raw === 'allow' || raw === 'deny') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function save_choice(value: 'allow' | 'deny') {
  try {
    localStorage.setItem(choice_key, value);
  } catch {
    /* ignore */
  }
}

async function resolve_user_id() {
  if (is_supabase_configured()) {
    try {
      const auth = await get_auth_state();
      if (auth.user_id && !auth.is_guest) return auth.user_id;
    } catch {
      /* ignore */
    }
  }
  return get_demo_user()?.id;
}

export default function notify_permission_gate() {
  return (
    <Suspense fallback={null}>
      <notify_permission_inner />
    </Suspense>
  );
}

function notify_permission_inner() {
  const pathname = usePathname();
  const [open, set_open] = useState(false);
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    if (staff_path(pathname)) {
      set_open(false);
      return;
    }
    if (!notifications_available()) return;

    if (Notification.permission === 'granted') {
      void resolve_user_id().then((id) => subscribe_to_push(id));
      return;
    }
    if (Notification.permission === 'denied') return;
    if (our_choice() === 'deny') return;

    let cancelled = false;
    let seen = false;
    try {
      seen = sessionStorage.getItem(splash_key) === '1';
    } catch {
      seen = true;
    }
    const delay = seen ? 900 : 6000;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (Notification.permission !== 'default') return;
      if (our_choice() === 'deny') return;
      set_open(true);
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  if (!open) return null;

  async function handle_allow() {
    set_busy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        save_choice('allow');
        set_open(false);
        const id = await resolve_user_id();
        await subscribe_to_push(id);
        return;
      }
      if (perm === 'denied') {
        save_choice('deny');
        set_open(false);
        return;
      }
      // системное окно закрыли без ответа — спросим снова
    } finally {
      set_busy(false);
    }
  }

  function handle_deny() {
    save_choice('deny');
    set_open(false);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft p-6 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
          уведомления о заказе
        </h2>
        <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
          так удобнее следить за статусом: напишем, когда начали готовить и когда
          можно забирать — даже если приложение закрыто.
        </p>
        <div className="mt-6 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handle_allow()}
            className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
          >
            {busy ? 'спрашиваем…' : 'можно'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handle_deny}
            className="w-full rounded-pill bg-surface text-neutral-800 py-3.5 text-sm font-medium disabled:opacity-60"
          >
            нет
          </button>
        </div>
      </div>
    </div>
  );
}
