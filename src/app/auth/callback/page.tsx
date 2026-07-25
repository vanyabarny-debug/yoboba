'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sanitize_auth_return_path } from '@/lib/auth-return';
import { create_client } from '@/lib/supabase/client';

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, set_message] = useState('входим...');

  useEffect(() => {
    async function finish_login() {
      const supabase = create_client();
      const code = params.get('code');
      const token_hash = params.get('token_hash');
      const type = params.get('type') || 'magiclink';
      const safe_next = sanitize_auth_return_path(
        params.get('next') || params.get('returnTo')
      );

      if (token_hash) {
        // 1) сервер ставит httpOnly cookies — иначе /api/auth/profile не видит сессию
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token_hash, type }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { access_token: string; refresh_token: string };
        };

        if (res.ok && body.session?.access_token && body.session.refresh_token) {
          await supabase.auth.setSession({
            access_token: body.session.access_token,
            refresh_token: body.session.refresh_token,
          });
          window.location.assign(safe_next);
          return;
        }

        // 2) fallback: клиентский verify (как раньше)
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
        });
        if (error || !data.session) {
          const msg = body.error || error?.message || 'auth_callback_failed';
          router.replace(`/login?error=${encodeURIComponent(msg)}`);
          return;
        }
        window.location.assign(safe_next);
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
        window.location.assign(safe_next);
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
