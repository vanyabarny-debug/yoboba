'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { agent_log } from '@/lib/agent-log';
import { create_demo_user } from '@/lib/demo-auth';

function is_standalone_pwa() {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const ios = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

export default function admin_login_page() {
  const router = useRouter();
  const [login, set_login] = useState('');
  const [password, set_password] = useState('');
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [in_pwa, set_in_pwa] = useState(false);
  const mount_id = useRef(`login-${Date.now()}`);
  const render_count = useRef(0);
  render_count.current += 1;

  useEffect(() => {
    set_in_pwa(is_standalone_pwa());
    // #region agent log
    agent_log({ location: 'admin/login/page.tsx:mount', message: 'login page mounted', data: { mountId: mount_id.current }, hypothesisId: 'H1' });
    // #endregion

    // iOS: «Готово» в Safari sheet возвращает сюда с залипшим loading
    function unlock() {
      set_loading(false);
    }
    function on_page_show(e: PageTransitionEvent) {
      if (e.persisted) unlock();
    }
    window.addEventListener('pageshow', on_page_show);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') unlock();
    });

    return () => {
      window.removeEventListener('pageshow', on_page_show);
      // #region agent log
      agent_log({ location: 'admin/login/page.tsx:unmount', message: 'login page unmounted', data: { mountId: mount_id.current, renderCount: render_count.current }, hypothesisId: 'H1' });
      // #endregion
    };
  }, []);

  const prev_password_len = useRef(0);

  function handle_password_change(value: string) {
    const prev_len = prev_password_len.current;
    prev_password_len.current = value.length;
    set_password(value);
    // #region agent log
    agent_log({
      location: 'admin/login/page.tsx:password-change',
      message: 'password input changed',
      data: {
        mountId: mount_id.current,
        passwordLen: value.length,
        prevLen: prev_len,
        lenDecreased: value.length < prev_len && prev_len > 0,
        renderCount: render_count.current,
        loading,
      },
      hypothesisId: 'H1',
    });
    // #endregion
  }

  async function handle_submit(e: React.FormEvent) {
    e.preventDefault();
    // #region agent log
    agent_log({
      location: 'admin/login/page.tsx:submit',
      message: 'login form submitted',
      data: { mountId: mount_id.current, loginLen: login.trim().length, passwordLen: password.length },
      hypothesisId: 'H3',
    });
    // #endregion
    set_loading(true);
    set_error('');

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ login: login.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        role?: string;
        seller_id?: string;
        name?: string;
        spot_ids?: string[];
        error?: string;
      };

      if (!res.ok) {
        set_error(data.error || 'неверный логин или пароль');
        set_loading(false);
        return;
      }

      if (data.role === 'seller') {
        create_demo_user({
          id: data.seller_id || `seller-${Date.now()}`,
          name: data.name || 'бариста',
          role: 'seller',
          force: true,
        });
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(
            'yoboba_seller_spot_ids',
            JSON.stringify(data.spot_ids || [])
          );
          sessionStorage.removeItem('yoboba_seller_shift');
        }
        router.replace('/seller');
        return;
      }

      create_demo_user({ name: data.name || 'админ', role: 'admin', force: true });
      router.replace('/admin');
    } catch {
      set_error('ошибка сети — попробуйте ещё раз');
      set_loading(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface flex flex-col">
      {!in_pwa && (
        <div className="max-w-6xl mx-auto w-full px-4 py-3">
          <Link href="/" className="text-sm text-neutral-500">
            ← на сайт
          </Link>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1
              className="text-2xl font-bold tracking-tight text-accent"
              style={{ fontFamily: 'Fredoka, system-ui, sans-serif' }}
            >
              yoSquad
            </h1>
            <p className="text-sm text-neutral-500 mt-2">вход для команды точки</p>
          </div>

          <form
            onSubmit={handle_submit}
            className="bg-white rounded-2xl border border-surface p-6 shadow-soft space-y-4"
          >
            <label className="block">
              <span className="text-sm text-neutral-600">логин</span>
              <input
                type="text"
                value={login}
                onChange={(e) => set_login(e.target.value)}
                autoComplete="username"
                className="mt-1 w-full rounded-xl border border-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm text-neutral-600">пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => handle_password_change(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent text-accent-foreground py-3.5 font-semibold disabled:opacity-50"
            >
              {loading ? 'входим...' : 'войти'}
            </button>
            {error && <p className="text-sm text-accent text-center">{error}</p>}
          </form>

          <p className="text-xs text-neutral-400 text-center mt-4">
            админ: admin / admin
          </p>
          {!in_pwa && (
            <p className="text-xs text-neutral-400 text-center mt-3 leading-relaxed px-2">
              чтобы убрать адресную строку: «поделиться» → «на экран „Домой“»,
              открывать только с иконки yoSquad
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
