'use client';

import Link from 'next/link';
import { createElement, Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import site_chrome from '@/components/site-chrome';
import { get_auth_state, sign_out, type profile } from '@/lib/auth';
import {
  bonus_earning_rules,
  FREE_DRINK_BONUS_THRESHOLD,
  format_price,
} from '@/lib/cart-summary';
import { fetch_my_orders } from '@/lib/orders';
import type { order } from '@/lib/types';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';

const status_label: Record<order['status'], string> = {
  new: 'новый',
  preparing: 'готовим',
  ready: 'готов',
  completed: 'выдан',
  cancelled: 'отменён',
};

const payment_label: Record<order['payment_type'], string> = {
  cash: 'наличными',
  card: 'картой',
  online: 'онлайн',
};

function format_datetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function format_phone(phone: string | null | undefined) {
  if (!phone) return 'не указан';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) {
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  return phone;
}

function short_order_id(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function profile_page() {
  const router = useRouter();
  const demo_mode = !is_supabase_configured();

  const [loading, set_loading] = useState(true);
  const [profile, set_profile] = useState<profile | null>(null);
  const [orders, set_orders] = useState<order[]>([]);
  const [orders_error, set_orders_error] = useState('');
  const [editing_name, set_editing_name] = useState(false);
  const [name_draft, set_name_draft] = useState('');
  const [saving_name, set_saving_name] = useState(false);
  const [name_error, set_name_error] = useState('');
  const [expanded_order, set_expanded_order] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      set_loading(true);

      if (demo_mode) {
        const u = get_demo_user();
        if (!u || u.is_guest || u.role !== 'user') {
          router.replace('/login?returnUrl=/profile');
          return;
        }
        if (!cancelled) {
          set_profile({
            id: u.id,
            phone: u.phone || null,
            name: u.name,
            bonus_balance: u.bonus_balance,
            role: 'user',
          });
          set_orders([]);
          set_loading(false);
        }
        return;
      }

      const auth = await get_auth_state();
      if (!auth.is_permanent || !auth.profile) {
        router.replace('/login?returnUrl=/profile');
        return;
      }

      if (cancelled) return;
      set_profile(auth.profile);
      set_name_draft(auth.profile.name || '');

      const { data, error } = await fetch_my_orders();
      if (!cancelled) {
        set_orders(data);
        set_orders_error(error ? error.message : '');
        set_loading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [demo_mode, router]);

  async function handle_save_name() {
    if (!profile) return;
    const next = name_draft.trim();
    if (next.length < 2) {
      set_name_error('укажите имя');
      return;
    }

    set_saving_name(true);
    set_name_error('');

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      const body = (await res.json()) as { profile?: profile; error?: string };
      if (!res.ok || !body.profile) {
        set_name_error(body.error || 'не удалось сохранить');
        return;
      }
      set_profile(body.profile);
      set_editing_name(false);
    } catch {
      set_name_error('не удалось сохранить');
    } finally {
      set_saving_name(false);
    }
  }

  async function handle_logout() {
    if (demo_mode) {
      await clear_session();
    } else {
      await sign_out();
    }
    router.push('/');
  }

  const content = loading || !profile ? (
    <div className="page-shell py-12">
      <p className="text-neutral-500">загрузка профиля…</p>
    </div>
  ) : (
    <div className="page-shell py-6 sm:py-8 pb-[calc(4rem+var(--safe-bottom))] space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-500 mb-1">
            <Link href="/" className="hover:text-accent transition-colors">
              ← на главную
            </Link>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
            личный кабинет
          </h1>
        </div>
        <button
          type="button"
          onClick={handle_logout}
          className="shrink-0 rounded-pill border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          выйти
        </button>
      </div>

      {/* шарики */}
      <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500 mb-1">ваши шарики тапиоки</p>
            <p className="text-3xl sm:text-4xl font-bold text-accent tabular-nums">
              {profile.bonus_balance}
            </p>
          </div>
          <div className="text-right text-sm text-neutral-500 max-w-[12rem] leading-snug">
            до бесплатного напитка:{' '}
            <span className="font-semibold text-neutral-800">
              {Math.max(0, FREE_DRINK_BONUS_THRESHOLD - profile.bonus_balance)}
            </span>
          </div>
        </div>
        <div className="mt-4 h-2 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{
              width: `${Math.min(100, (profile.bonus_balance / FREE_DRINK_BONUS_THRESHOLD) * 100)}%`,
            }}
          />
        </div>
      </section>

      {/* личные данные */}
      <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft space-y-4">
        <h2 className="text-lg font-bold text-neutral-900">личные данные</h2>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-xs text-neutral-500">имя</label>
            {!editing_name && (
              <button
                type="button"
                onClick={() => {
                  set_name_draft(profile.name || '');
                  set_editing_name(true);
                  set_name_error('');
                }}
                className="text-xs font-semibold text-accent hover:underline"
              >
                изменить
              </button>
            )}
          </div>
          {editing_name ? (
            <div className="space-y-2">
              <input
                value={name_draft}
                onChange={(e) => set_name_draft(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm"
                autoFocus
              />
              {name_error && <p className="text-xs text-red-500">{name_error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set_editing_name(false)}
                  className="flex-1 rounded-pill border border-neutral-200 py-2 text-sm"
                >
                  отмена
                </button>
                <button
                  type="button"
                  disabled={saving_name}
                  onClick={handle_save_name}
                  className="flex-1 rounded-pill bg-accent text-accent-foreground py-2 text-sm font-medium disabled:opacity-60"
                >
                  {saving_name ? 'сохраняем…' : 'сохранить'}
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-page px-3 py-2.5 text-sm font-medium text-neutral-900">
              {profile.name || 'гость'}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-neutral-500 mb-1.5 block">телефон</label>
          <p className="rounded-xl bg-page px-3 py-2.5 text-sm font-medium text-neutral-900">
            {format_phone(profile.phone)}
          </p>
          <p className="mt-1.5 text-xs text-neutral-400">
            подтягивается из VK при входе
          </p>
        </div>
      </section>

      {/* условия */}
      <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft space-y-3">
        <h2 className="text-lg font-bold text-neutral-900">условия получения шариков</h2>
        <ul className="space-y-2.5">
          {bonus_earning_rules.map((rule) => (
            <li key={rule} className="flex gap-3 text-sm text-neutral-700 leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* заказы */}
      <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-bold text-neutral-900">история заказов</h2>
          <p className="text-xs text-neutral-500">
            {orders.length === 0
              ? 'пока пусто'
              : `${orders.length} ${orders.length === 1 ? 'заказ' : orders.length < 5 ? 'заказа' : 'заказов'}`}
          </p>
        </div>

        {orders_error && (
          <p className="text-sm text-red-500">{orders_error}</p>
        )}

        {orders.length === 0 && !orders_error ? (
          <div className="rounded-xl bg-page px-4 py-8 text-center">
            <p className="text-sm text-neutral-500 mb-3">вы ещё ничего не заказывали</p>
            <Link
              href="/"
              className="inline-flex rounded-pill bg-accent text-accent-foreground px-5 py-2.5 text-sm font-medium"
            >
              в меню
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {orders.map((o) => {
              const open = expanded_order === o.id;
              return (
                <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => set_expanded_order(open ? null : o.id)}
                    className="w-full text-left flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">
                        № {short_order_id(o.id)}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {format_datetime(o.created_at)} · {status_label[o.status]}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {format_price(o.total_price)} ₽
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {payment_label[o.payment_type]}
                      </p>
                    </div>
                  </button>
                  {open && (
                    <ul className="mt-2 ml-1 space-y-1 border-l-2 border-accent/30 pl-3">
                      {o.items.map((item, idx) => (
                        <li
                          key={`${item.menu_id}-${idx}`}
                          className="flex justify-between gap-2 text-xs text-neutral-600"
                        >
                          <span>
                            {item.name} × {item.quantity}
                          </span>
                          <span className="tabular-nums shrink-0">
                            {format_price(item.price * item.quantity)} ₽
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(site_chrome, null, content)
  );
}
