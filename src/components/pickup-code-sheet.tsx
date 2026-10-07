'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  format_pickup_code_display,
  pickup_qr_payload,
} from '@/lib/pickup-code';
import { read_json_response } from '@/lib/read-json-response';

type props = {
  open: boolean;
  is_logged_in: boolean;
  demo_mode?: boolean;
  user_id?: string | null;
  user_name?: string | null;
  user_phone?: string | null;
  bonus: number;
  on_close: () => void;
  on_need_login: () => void;
};

export default function pickup_code_sheet({
  open,
  is_logged_in,
  demo_mode = false,
  user_id,
  user_name,
  user_phone,
  bonus,
  on_close,
  on_need_login,
}: props) {
  const [code, set_code] = useState<string | null>(null);
  const [expires_at, set_expires_at] = useState<string | null>(null);
  const [qr_url, set_qr_url] = useState<string | null>(null);
  const [balance, set_balance] = useState(bonus);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');

  useEffect(() => {
    if (!open || !is_logged_in) return;
    set_balance(bonus);

    let cancelled = false;
    let refresh_timer: number | null = null;

    async function load_code() {
      set_busy(true);
      set_error('');

      const params = new URLSearchParams();
      if (demo_mode && user_id) {
        params.set('demo_user_id', user_id);
        if (user_name) params.set('name', user_name);
        if (user_phone) params.set('phone', user_phone);
        params.set('bonus', String(bonus));
      }

      const qs = params.toString();
      try {
        const r = await fetch(`/api/me/pickup-code${qs ? `?${qs}` : ''}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const body = await read_json_response<{
          code?: string;
          expires_at?: string;
          bonus_balance?: number;
          error?: string;
        }>(r);
        if (!r.ok) throw new Error(body.error || 'не удалось получить код');
        if (cancelled) return;
        if (!body.code) throw new Error('пустой код');
        set_code(body.code);
        set_expires_at(body.expires_at || null);
        if (typeof body.bonus_balance === 'number') set_balance(body.bonus_balance);
        const data_url = await QRCode.toDataURL(pickup_qr_payload(body.code), {
          margin: 1,
          width: 240,
          color: { dark: '#002d7a', light: '#ffffff' },
        });
        if (!cancelled) set_qr_url(data_url);

        if (body.expires_at && !cancelled) {
          const ms = new Date(body.expires_at).getTime() - Date.now() - 5_000;
          if (ms > 0) {
            refresh_timer = window.setTimeout(() => {
              void load_code();
            }, ms);
          }
        }
      } catch (e) {
        if (!cancelled) {
          set_error(e instanceof Error ? e.message : 'ошибка');
          set_code(null);
          set_qr_url(null);
        }
      } finally {
        if (!cancelled) set_busy(false);
      }
    }

    void load_code();

    return () => {
      cancelled = true;
      if (refresh_timer) window.clearTimeout(refresh_timer);
    };
  }, [open, is_logged_in, demo_mode, user_id, user_name, user_phone, bonus]);

  if (!open) return null;

  const expires_label = expires_at
    ? new Date(expires_at).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45"
        onClick={on_close}
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft px-6 pt-6 pb-[max(1.5rem,var(--safe-bottom))] sm:p-8">
        <button
          type="button"
          onClick={on_close}
          className="absolute right-4 top-4 rounded-full bg-surface px-3 py-1.5 text-sm font-medium text-neutral-600"
        >
          закрыть
        </button>

        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-16">мой код</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          покажите QR баристе или назовите цифры — телефон диктовать не нужно
        </p>

        {!is_logged_in ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-neutral-600">
              войдите в аккаунт, чтобы получить персональный код на кассе
            </p>
            <button
              type="button"
              onClick={on_need_login}
              className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm font-semibold"
            >
              войти
            </button>
          </div>
        ) : busy && !code ? (
          <p className="mt-10 text-center text-sm text-neutral-400">готовим код…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-accent">{error}</p>
        ) : (
          <div className="mt-6 flex flex-col items-center">
            {qr_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr_url}
                alt="QR-код для кассы"
                className="h-52 w-52 rounded-2xl border border-neutral-100 bg-white p-2"
              />
            ) : (
              <div className="h-52 w-52 rounded-2xl bg-surface animate-pulse" />
            )}

            <p className="mt-5 font-mono text-4xl sm:text-5xl font-extrabold tracking-[0.18em] tabular-nums text-accent-soft">
              {code ? format_pickup_code_display(code) : '—— ——'}
            </p>

            <p className="mt-3 text-sm font-medium text-neutral-700">
              {balance} бобаллов
              {user_name ? (
                <span className="text-neutral-400"> · {user_name}</span>
              ) : null}
            </p>

            <p className="mt-4 text-center text-xs leading-relaxed text-neutral-400">
              код обновится после покупки
              {expires_label ? ` · действует до ${expires_label}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
