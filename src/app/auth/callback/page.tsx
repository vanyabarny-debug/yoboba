'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { sanitize_auth_return_path } from '@/lib/auth-return';
import { create_client } from '@/lib/supabase/client';

function read_hash_params() {
  if (typeof window === 'undefined') return new URLSearchParams();
  const raw = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(raw);
}

async function claim_cookies(access_token: string, refresh_token: string) {
  try {
    await fetch('/api/auth/claim-session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token }),
    });
  } catch {
    /* browser cookies from setSession/verifyOtp уже есть */
  }
}

function AuthCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, set_message] = useState('входим...');

  useEffect(() => {
    async function finish_login() {
      const supabase = create_client();
      const hash = read_hash_params();
      const vk = params.get('vk') === '1';
      const safe_next = sanitize_auth_return_path(
        params.get('next') || params.get('returnTo') || hash.get('next')
      );

      // VK: короткий OTP из sessionStorage
      if (vk) {
        try {
          const raw = sessionStorage.getItem('yoboba_vk_otp');
          sessionStorage.removeItem('yoboba_vk_otp');
          if (!raw) {
            router.replace('/login?error=' + encodeURIComponent('код входа не найден'));
            return;
          }
          const saved = JSON.parse(raw) as {
            email?: string;
            token?: string;
            next?: string;
          };
          if (!saved.email || !saved.token) {
            router.replace('/login?error=' + encodeURIComponent('код входа пустой'));
            return;
          }

          let verified = await supabase.auth.verifyOtp({
            email: saved.email,
            token: saved.token,
            type: 'magiclink',
          });
          if (verified.error || !verified.data.session) {
            verified = await supabase.auth.verifyOtp({
              email: saved.email,
              token: saved.token,
              type: 'email',
            });
          }
          if (verified.error || !verified.data.session) {
            router.replace(
              `/login?error=${encodeURIComponent(
                verified.error?.message || 'не удалось подтвердить вход'
              )}`
            );
            return;
          }

          await claim_cookies(
            verified.data.session.access_token,
            verified.data.session.refresh_token
          );

          const next = sanitize_auth_return_path(saved.next || safe_next);
          window.location.replace(next);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'vk_otp_failed';
          router.replace(`/login?error=${encodeURIComponent(msg)}`);
          return;
        }
      }

      const code = params.get('code') || hash.get('code');
      const token_hash = params.get('token_hash') || hash.get('token_hash');
      const type = params.get('type') || hash.get('type') || 'magiclink';
      const access_token = params.get('access_token') || hash.get('access_token');
      const refresh_token = params.get('refresh_token') || hash.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        await claim_cookies(access_token, refresh_token);
        window.location.replace(safe_next);
        return;
      }

      if (token_hash) {
        let result = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
        });
        if ((result.error || !result.data.session) && type !== 'email') {
          result = await supabase.auth.verifyOtp({
            token_hash,
            type: 'email',
          });
        }
        if (result.error || !result.data.session) {
          router.replace(
            `/login?error=${encodeURIComponent(result.error?.message || 'auth_callback_failed')}`
          );
          return;
        }
        await claim_cookies(
          result.data.session.access_token,
          result.data.session.refresh_token
        );
        window.location.replace(safe_next);
        return;
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.session) {
          const res = await fetch('/api/auth/exchange', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            router.replace(
              `/login?error=${encodeURIComponent(error?.message || 'exchange failed')}`
            );
            return;
          }
        } else {
          await claim_cookies(data.session.access_token, data.session.refresh_token);
        }
        window.location.replace(safe_next);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && session.user.is_anonymous !== true) {
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
