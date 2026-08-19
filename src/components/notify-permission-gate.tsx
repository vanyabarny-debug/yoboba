'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { subscribe_to_push } from '@/components/pwa-register';
import { get_demo_user } from '@/lib/demo-auth';
import { get_auth_state } from '@/lib/auth';
import { is_supabase_configured } from '@/lib/supabase/config';

const choice_key = 'yoboba_notify_choice_v2';
const splash_key = 'yoboba_splash_seen';

type sheet_mode = 'ask' | 'install' | 'settings';

function staff_path(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/seller') ||
    pathname.startsWith('/barista') ||
    pathname.startsWith('/squad')
  );
}

function is_ios() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iua = /iphone|ipad|ipod/i.test(ua);
  const ipad =
    window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return iua || ipad;
}

function is_standalone_pwa() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
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

function splash_done() {
  try {
    return sessionStorage.getItem(splash_key) === '1';
  } catch {
    return true;
  }
}

function system_permission(): NotificationPermission | 'missing' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'missing';
  return Notification.permission;
}

function still_needs_prompt() {
  if (our_choice() === 'deny') return false;
  const perm = system_permission();
  if (perm === 'granted') return false;
  return true;
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

async function kick_service_worker() {
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV === 'development') return;
  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch {
    /* ignore */
  }
}

export default function notify_permission_gate() {
  return (
    <Suspense fallback={null}>
      <NotifyPermissionInner />
    </Suspense>
  );
}

function NotifyPermissionInner() {
  const pathname = usePathname();
  const [open, set_open] = useState(false);
  const [busy, set_busy] = useState(false);
  const [mode, set_mode] = useState<sheet_mode>('ask');

  useEffect(() => {
    if (staff_path(pathname)) {
      set_open(false);
      return;
    }

    let cancelled = false;

    function try_open(ignore_splash = false) {
      if (cancelled || staff_path(pathname)) return;
      if (!ignore_splash && !splash_done()) return;
      if (system_permission() === 'granted') {
        set_open(false);
        void resolve_user_id().then((id) => subscribe_to_push(id));
        return;
      }
      if (!still_needs_prompt()) {
        set_open(false);
        return;
      }
      if (!is_standalone_pwa() && is_ios()) set_mode('install');
      else set_mode('ask');
      set_open(true);
    }

    async function boot() {
      void kick_service_worker();
      const started = Date.now();
      while (!cancelled) {
        if (splash_done() || Date.now() - started > 6500) break;
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
      if (cancelled) return;
      try_open(true);
    }

    void boot();

    function on_resume() {
      if (document.visibilityState === 'hidden') return;
      try_open();
    }

    window.addEventListener('pageshow', on_resume);
    document.addEventListener('visibilitychange', on_resume);
    window.addEventListener('focus', on_resume);

    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', on_resume);
      document.removeEventListener('visibilitychange', on_resume);
      window.removeEventListener('focus', on_resume);
    };
  }, [pathname]);

  if (!open) return null;

  async function handle_allow() {
    set_busy(true);
    try {
      if (!is_standalone_pwa() && is_ios()) {
        set_mode('install');
        return;
      }

      void kick_service_worker();

      if (!('Notification' in window)) {
        set_mode(is_ios() ? 'install' : 'settings');
        return;
      }

      // iOS: requestPermission должен идти сразу из тапа, без await перед ним
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        save_choice('allow');
        set_open(false);
        const id = await resolve_user_id();
        await subscribe_to_push(id);
        return;
      }
      if (perm === 'denied') {
        set_mode('settings');
      }
    } finally {
      set_busy(false);
    }
  }

  function handle_deny() {
    save_choice('deny');
    set_open(false);
  }

  const title =
    mode === 'install'
      ? 'добавь на экран «домой»'
      : mode === 'settings'
        ? 'включи уведомления'
        : 'уведомления о заказе';

  const body =
    mode === 'install'
      ? 'на айфоне пуши работают только из приложения на экране домой. нажми «поделиться» → «на экран домой», открой ярлык — спросим ещё раз.'
      : mode === 'settings'
        ? 'айфон запомнил отказ. открой настройки → yomoyo → уведомления и разреши, потом вернись сюда.'
        : 'так удобнее следить за статусом: напишем, когда начали готовить и когда можно забирать — даже если приложение закрыто.';

  return (
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft p-6 sm:p-8">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">{title}</h2>
        <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
          {body}
        </p>
        <div className="mt-6 space-y-3">
          {mode === 'ask' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handle_allow()}
              className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
            >
              {busy ? 'спрашиваем…' : 'можно'}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handle_allow()}
              className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
            >
              {busy ? 'проверяем…' : 'уже добавил, разрешить'}
            </button>
          )}
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
