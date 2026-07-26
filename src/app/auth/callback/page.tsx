'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sanitize_auth_return_path } from '@/lib/auth-return';
import { create_client } from '@/lib/supabase/client';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wait_for_permanent_user(supabase: ReturnType<typeof create_client>) {
  for (let i = 0; i < 12; i++) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.is_anonymous !== true) return user;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && session.user.is_anonymous !== true) return session.user;
    await sleep(60 + i * 40);
  }
  return null;
}

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, set_message] = useState('входим...');

  useEffect(() => {
    async function finish_login() {
      const supabase = create_client();
      const code = params.get('code');
      const token_hash = params.get('token_hash');
      const type = params.get('type') || 'email';
      const sync = params.get('sync') === '1';
      const safe_next = sanitize_auth_return_path(
        params.get('next') || params.get('returnTo')
      );

      // VK: токены из sessionStorage → setSession в браузере
      if (sync) {
        try {
          const raw = sessionStorage.getItem('yoboba_vk_session');
          if (raw) {
            sessionStorage.removeItem('yoboba_vk_session');
            const saved = JSON.parse(raw) as {
              access_token?: string;
              refresh_token?: string;
            };
            if (!saved.access_token || !saved.refresh_token) {
              router.replace('/login?error=' + encodeURIComponent('сессия пустая'));
              return;
            }
            const { error } = await supabase.auth.setSession({
              access_token: saved.access_token,
              refresh_token: saved.refresh_token,
            });
            if (error) {
              router.replace(`/login?error=${encodeURIComponent(error.message)}`);
              return;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'session_sync_failed';
          router.replace(`/login?error=${encodeURIComponent(msg)}`);
          return;
        }

        const user = await wait_for_permanent_user(supabase);
        if (!user) {
          router.replace('/login?error=' + encodeURIComponent('сессия не сохранилась'));
          return;
        }

        // подтянуть cookies на сервер (не обязательно для UI)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token && session.refresh_token) {
            void fetch('/api/auth/claim-session', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              }),
              keepalive: true,
            });
          }
        } catch {
          /* ignore */
        }

        window.location.replace(safe_next);
        return;
      }

      if (token_hash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
        });
        if (error || !data.session) {
          router.replace(
            `/login?error=${encodeURIComponent(error?.message || 'auth_callback_failed')}`
          );
          return;
        }
        window.location.replace(safe_next);
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const res = await fetch('/api/auth/exchange', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            router.replace(`/login?error=${encodeURIComponent(error.message)}`);
            return;
          }
        }
        window.location.replace(safe_next);
        return;
      }

      set_message('не удалось подтвердить вход');
      router.replace('/login?error=auth_callback_failed');
    }

    void finish_login();
  }, [params, router]);

  return (
    <main className="min-h-screen bg-page flex items-center justify-center p-4">
      <p className="text-sm text-neutral-500">{message}</p>
    </main>
  );
}

export default function auth_callback_page() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-page flex items-center justify-center p-4">
          <p className="text-sm text-neutral-500">входим...</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
