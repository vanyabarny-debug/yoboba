'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sign_in_with_otp, verify_otp } from '@/lib/auth';
import { is_supabase_configured } from '@/lib/supabase/config';
import { create_demo_user, sync_session } from '@/lib/demo-auth';

type step = 'phone' | 'code';

export default function login_client() {
  const router = useRouter();
  const params = useSearchParams();
  const return_url = params.get('returnUrl') || '/';
  const demo = !is_supabase_configured();

  const [step, set_step] = useState<step>('phone');
  const [phone, set_phone] = useState('');
  const [code, set_code] = useState('');
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [info, set_info] = useState('');

  useEffect(() => {
    if (demo) set_info('демо: введите любой код из 4 цифр');
  }, [demo]);

  async function handle_send(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    if (demo) {
      set_loading(false);
      set_step('code');
      return;
    }

    const { error: err } = await sign_in_with_otp(phone);
    set_loading(false);
    if (err) {
      set_error('не удалось отправить код');
      return;
    }
    set_step('code');
  }

  async function handle_verify(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    if (demo) {
      if (code.length < 4) {
        set_loading(false);
        set_error('код должен быть не короче 4 цифр');
        return;
      }
      create_demo_user({ phone, name: 'гость', role: 'user' });
      await sync_session('user');
      set_loading(false);
      router.push(return_url);
      return;
    }

    const { error: err } = await verify_otp(phone, code);
    set_loading(false);
    if (err) {
      set_error('неверный код');
      return;
    }
    await sync_session('user');
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
            <div className="inline-flex w-14 h-14 rounded-full bg-accent items-center justify-center mb-4">
              <span className="text-white font-bold text-lg">yo</span>
            </div>
            <h1 className="text-2xl font-bold">вход</h1>
            <p className="text-sm text-neutral-500 mt-2">
              {step === 'phone'
                ? 'введите номер — отправим код в смс'
                : `код отправлен на ${phone}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-surface p-6 shadow-soft">
            {step === 'phone' ? (
              <form onSubmit={handle_send} className="space-y-4">
                <label className="block">
                  <span className="text-sm text-neutral-600">номер телефона</span>
                  <div className="mt-1 flex rounded-xl border border-neutral-200 overflow-hidden focus-within:ring-2 focus-within:ring-highlight">
                    <span className="px-3 py-3 bg-surface text-sm text-neutral-500 border-r border-neutral-200">
                      +7
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => set_phone(e.target.value)}
                      placeholder="900 123 45 67"
                      className="flex-1 px-4 py-3 focus:outline-none"
                      autoFocus
                      required
                    />
                  </div>
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-accent text-white py-3.5 font-semibold disabled:opacity-50"
                >
                  {loading ? 'отправляем...' : 'получить код'}
                </button>
              </form>
            ) : (
              <form onSubmit={handle_verify} className="space-y-4">
                <label className="block">
                  <span className="text-sm text-neutral-600">код из смс</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => set_code(e.target.value)}
                    placeholder="• • • •"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3.5 text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-highlight"
                    autoFocus
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-accent text-white py-3.5 font-semibold disabled:opacity-50"
                >
                  {loading ? 'проверяем...' : 'войти'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    set_step('phone');
                    set_code('');
                    set_error('');
                  }}
                  className="w-full text-sm text-neutral-500 py-1"
                >
                  изменить номер
                </button>
              </form>
            )}

            {info && step === 'code' && (
              <p className="mt-4 text-xs text-neutral-400 text-center">{info}</p>
            )}
            {error && <p className="mt-4 text-sm text-accent text-center">{error}</p>}
          </div>

          <p className="text-center text-xs text-neutral-400 mt-6 leading-relaxed">
            нажимая «получить код», вы соглашаетесь с условиями сервиса
          </p>
        </div>
      </div>
    </main>
  );
}
