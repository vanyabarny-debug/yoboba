'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { create_client } from '@/lib/supabase/client';

export default function auth_callback_page() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, set_message] = useState('входим...');

  useEffect(() => {
    async function finish_login() {
      const supabase = create_client();
      const code = params.get('code');
      const token_hash = params.get('token_hash');
      const type = params.get('type');
      const next = params.get('next') || params.get('returnTo') || '/';
      const safe_next = next.startsWith('/') ? next : '/';

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'email' | 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email_change',
        });
        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
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
