'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sign_in_with_email, start_vk_sign_in, verify_email_otp } from '@/lib/auth';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_demo_user, sync_session } from '@/lib/demo-auth';
import { is_vk_auth_configured } from '@/lib/vk-auth-config';

type email_step = 'email' | 'sent';

export default function login_client() {
  const router = useRouter();
  const params = useSearchParams();
  const return_url = params.get('returnUrl') || '/';
  const demo = !is_supabase_configured();
  const vk_ready = is_vk_auth_configured();

  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [demo_code, set_demo_code] = useState('');
  const [email, set_email] = useState('');
  const [code, set_code] = useState('');
  const [email_step, set_email_step] = useState<email_step>('email');

  useEffect(() => {
    const auth_error = params.get('error');
    if (auth_error) {
      set_error(
        auth_error === 'vk_state_mismatch'
          ? 'сессия vk устарела — попробуйте ещё раз'
          : auth_error === 'auth_callback_failed'
            ? 'не удалось подтвердить вход — попробуйте снова'
            : decodeURIComponent(auth_error).replace(/\+/g, ' ')
      );
    }
  }, [params]);

  async function handle_demo_login(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    if (demo_code.length < 4) {
      set_loading(false);
      set_error('код должен быть не короче 4 цифр');
      return;
    }

    create_demo_user({ phone: '', name: 'гость', role: 'user' });
    await sync_session('user');
    set_loading(false);
    router.push(return_url);
  }

  function handle_vk_login() {
    set_loading(true);
    set_error('');
    const { error: err } = start_vk_sign_in(return_url);
    if (err) {
      set_loading(false);
      set_error('vk вход не настроен');
    }
  }

  async function send_email_link() {
    set_loading(true);
    set_error('');

    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      set_loading(false);
      set_error('введите корректный email');
      return;
    }

    const { error: err } = await sign_in_with_email(trimmed, return_url);
    set_loading(false);

    if (err) {
      set_error(err.message);
      return;
    }

    set_email_step('sent');
  }

  async function handle_send_link(e: React.FormEvent) {
    e.preventDefault();
    await send_email_link();
  }

  async function handle_verify_code(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    const { error: err } = await verify_email_otp(email, code);
    set_loading(false);

    if (err) {
      set_error(err.message);
      return;
    }

    router.push(return_url);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-page flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 py-3">
        <Link href="/" className="text-sm text-neutral-500">
          ← на главную
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">вход</h1>
            <p className="text-sm text-neutral-500 mt-2">
              {demo
                ? 'демо-режим без supabase'
                : 'нужен, чтобы оформить заказ и копить шарики'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-surface p-6 shadow-soft space-y-4">
            {demo ? (
              <form onSubmit={handle_demo_login} className="space-y-4">
                <label className="block">
                  <span className="text-sm text-neutral-600">демо-код</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={demo_code}
                    onChange={(e) => set_demo_code(e.target.value)}
                    placeholder="• • • •"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-highlight"
                    autoFocus
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
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handle_vk_login}
                  disabled={loading || !vk_ready}
                  className="w-full rounded-xl bg-[#0077FF] text-white py-3.5 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span aria-hidden="true">VK</span>
                  {loading ? 'переходим...' : 'войти через vk'}
                </button>

                {!vk_ready && (
                  <p className="text-xs text-neutral-400 text-center leading-relaxed">
                    vk ещё не настроен — можно войти по почте
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200" />
                  <span>или</span>
                  <span className="h-px flex-1 bg-neutral-200" />
                </div>

                {email_step === 'email' ? (
                  <form onSubmit={handle_send_link} className="space-y-4">
                    <label className="block">
                      <span className="text-sm text-neutral-600">email</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => set_email(e.target.value)}
                        placeholder="you@example.com"
                        className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-highlight"
                        autoComplete="email"
                        autoFocus={!vk_ready}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-xl bg-accent text-accent-foreground py-3.5 font-semibold disabled:opacity-50"
                    >
                      {loading ? 'отправляем...' : 'получить ссылку для входа'}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-surface px-4 py-4 text-sm text-neutral-600 leading-relaxed">
                      <p>
                        письмо отправлено на{' '}
                        <span className="font-medium text-neutral-800">{email}</span>
                      </p>
                      <p className="mt-2">
                        откройте его и нажмите кнопку{' '}
                        <span className="font-medium text-neutral-800">Confirm email address</span> — вас
                        вернёт на сайт уже залогиненным
                      </p>
                      <p className="mt-2 text-xs text-neutral-400">
                        проверьте «Спам», если письма нет 1–2 минуты
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void send_email_link()}
                      className="w-full text-sm text-accent hover:underline disabled:opacity-50"
                    >
                      отправить ссылку ещё раз
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        set_email_step('email');
                        set_code('');
                        set_error('');
                      }}
                      className="w-full text-sm text-neutral-500 hover:text-neutral-800"
                    >
                      ← другой email
                    </button>

                    <details className="text-xs text-neutral-400">
                      <summary className="cursor-pointer hover:text-neutral-600">
                        в письме есть цифровой код?
                      </summary>
                      <form onSubmit={handle_verify_code} className="mt-3 space-y-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={code}
                          onChange={(e) => set_code(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="код из письма"
                          className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-highlight"
                        />
                        <button
                          type="submit"
                          disabled={loading || code.length < 6}
                          className="w-full rounded-xl border border-neutral-200 py-2.5 text-sm disabled:opacity-50"
                        >
                          войти по коду
                        </button>
                      </form>
                    </details>
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-accent text-center">{error}</p>}
          </div>

          {!demo && (
            <p className="text-center text-xs text-neutral-400 mt-6 leading-relaxed">
              без входа можно смотреть меню и собирать корзину — оформление заказа только после
              авторизации
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
