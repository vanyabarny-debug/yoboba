'use client';

import Link from 'next/link';
import { createElement, Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import site_chrome from '@/components/site-chrome';
import TapicoinIcon from '@/components/tapicoin-icon';
import { get_auth_state, sign_out, update_profile, type profile } from '@/lib/auth';
import {
  bonus_earning_rules,
  FREE_DRINK_BONUS_THRESHOLD,
  format_price,
} from '@/lib/cart-summary';
import { fetch_my_orders } from '@/lib/orders';
import { format_order_number } from '@/lib/order-number';
import type { order } from '@/lib/types';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session } from '@/lib/demo-auth';
import {
  add_linked_card,
  get_profile_local,
  remove_linked_card,
  save_profile_local,
  type profile_local,
} from '@/lib/profile-local';
import { createBrowserClient } from '@supabase/ssr';
import {
  format_phone_display,
  format_phone_input,
  phone_input_to_e164,
} from '@/lib/phone';

function parse_vk_birthday(raw?: string | null): string {
  if (!raw) return '';
  // VK: DD.MM.YYYY
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  return '';
}

async function seed_local_from_vk(user_id: string, current: profile_local): Promise<profile_local> {
  if (!is_supabase_configured()) return current;
  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase.auth.getUser();
    const meta = data.user?.user_metadata as
      | {
          vk_email?: string | null;
          email?: string | null;
          birthday?: string | null;
          phone?: string | null;
        }
      | undefined;
    if (!meta) return current;

    let next = current;
    let changed = false;

    const vk_email =
      (meta.vk_email && !meta.vk_email.includes('@auth.yoboba') && meta.vk_email) ||
      (meta.email && !String(meta.email).includes('@auth.yoboba') && meta.email) ||
      '';
    if (!next.email && vk_email) {
      next = { ...next, email: String(vk_email) };
      changed = true;
    }

    const bday = parse_vk_birthday(meta.birthday);
    if (!next.birthday && bday) {
      next = { ...next, birthday: bday };
      changed = true;
    }

    if (changed) save_profile_local(user_id, next);
    return next;
  } catch {
    return current;
  }
}

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
  bonus: 'тапикоинами',
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

function format_birthday(iso: string) {
  if (!iso) return 'не указан';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function profile_page() {
  const router = useRouter();
  const demo_mode = !is_supabase_configured();

  const [loading, set_loading] = useState(true);
  const [profile, set_profile] = useState<profile | null>(null);
  const [local, set_local] = useState<profile_local | null>(null);
  const [orders, set_orders] = useState<order[]>([]);
  const [orders_error, set_orders_error] = useState('');
  const [editing_name, set_editing_name] = useState(false);
  const [editing_phone, set_editing_phone] = useState(false);
  const [phone_draft, set_phone_draft] = useState('');
  const [saving_phone, set_saving_phone] = useState(false);
  const [phone_error, set_phone_error] = useState('');
  const [name_draft, set_name_draft] = useState('');
  const [saving_name, set_saving_name] = useState(false);
  const [name_error, set_name_error] = useState('');
  const [editing_email, set_editing_email] = useState(false);
  const [email_draft, set_email_draft] = useState('');
  const [editing_birthday, set_editing_birthday] = useState(false);
  const [birthday_draft, set_birthday_draft] = useState('');
  const [card_brand, set_card_brand] = useState('МИР');
  const [card_last4, set_card_last4] = useState('');
  const [card_error, set_card_error] = useState('');
  const [adding_card, set_adding_card] = useState(false);

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
          const p = {
            id: u.id,
            phone: u.phone || null,
            name: u.name,
            bonus_balance: u.bonus_balance,
            role: 'user' as const,
          };
          set_profile(p);
          const loc = get_profile_local(u.id);
          set_local(loc);
          set_email_draft(loc.email);
          set_birthday_draft(loc.birthday);
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
      let loc = get_profile_local(auth.profile.id);
      loc = await seed_local_from_vk(auth.profile.id, loc);
      if (cancelled) return;
      set_local(loc);
      set_email_draft(loc.email);
      set_birthday_draft(loc.birthday);

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

  function persist_local(next: profile_local) {
    if (!profile) return;
    save_profile_local(profile.id, next);
    set_local(next);
  }

  async function handle_save_phone() {
    if (!profile) return;
    const phone = phone_input_to_e164(phone_draft);
    if (!phone) {
      set_phone_error('введите номер полностью');
      return;
    }

    set_saving_phone(true);
    set_phone_error('');

    const { profile: next, error } = await update_profile({ phone });
    set_saving_phone(false);

    if (error || !next) {
      set_phone_error(error?.message || 'не удалось сохранить');
      return;
    }

    set_profile(next);
    set_editing_phone(false);
  }

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

  function handle_save_email() {
    if (!profile || !local) return;
    persist_local({ ...local, email: email_draft.trim() });
    set_editing_email(false);
  }

  function handle_save_birthday() {
    if (!profile || !local) return;
    persist_local({ ...local, birthday: birthday_draft });
    set_editing_birthday(false);
  }

  function handle_toggle_marketing() {
    if (!profile || !local) return;
    persist_local({ ...local, marketing_opt_in: !local.marketing_opt_in });
  }

  function handle_add_card() {
    if (!profile) return;
    set_card_error('');
    try {
      const next = add_linked_card(profile.id, {
        brand: card_brand,
        last4: card_last4,
      });
      set_local(next);
      set_card_last4('');
      set_adding_card(false);
    } catch (e) {
      set_card_error(e instanceof Error ? e.message : 'не удалось добавить');
    }
  }

  function handle_remove_card(card_id: string) {
    if (!profile) return;
    set_local(remove_linked_card(profile.id, card_id));
  }

  async function handle_logout() {
    if (demo_mode) {
      await clear_session();
    } else {
      await sign_out();
    }
    router.push('/');
  }

  const content =
    loading || !profile || !local ? (
      <div className="page-shell py-12">
        <p className="text-neutral-500">загрузка профиля…</p>
      </div>
    ) : (
      <div className="page-shell py-6 sm:py-8 pb-[calc(4rem+var(--safe-bottom))] space-y-8 max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
            личный кабинет
          </h1>
          <button
            type="button"
            onClick={handle_logout}
            className="shrink-0 rounded-pill border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            выйти
          </button>
        </div>

        {/* тапикоины */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-500 mb-1 inline-flex items-center gap-1.5">
                <TapicoinIcon size={16} />
                ваши тапикоины
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-[#0039A6] tabular-nums inline-flex items-center gap-2">
                <TapicoinIcon size={28} />
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
              className="h-full rounded-full bg-[#0039A6] transition-all"
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
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs text-neutral-500">телефон</label>
              {!editing_phone && (
                <button
                  type="button"
                  onClick={() => {
                    const digits = (profile.phone || '').replace(/\D/g, '');
                    const local = digits.startsWith('7') ? digits.slice(1) : digits;
                    set_phone_draft(format_phone_input(local));
                    set_editing_phone(true);
                    set_phone_error('');
                  }}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  {profile.phone ? 'изменить' : 'указать'}
                </button>
              )}
            </div>
            {editing_phone ? (
              <div className="space-y-2">
                <div className="flex items-center rounded-xl border border-neutral-200 bg-page px-3 py-2.5">
                  <span className="text-sm font-medium text-neutral-500 pr-2">+7</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone_draft}
                    onChange={(e) => set_phone_draft(format_phone_input(e.target.value))}
                    placeholder="916 000-00-00"
                    className="flex-1 bg-transparent text-sm font-medium text-neutral-900 outline-none"
                    autoFocus
                  />
                </div>
                {phone_error && <p className="text-xs text-red-500">{phone_error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => set_editing_phone(false)}
                    className="flex-1 rounded-pill border border-neutral-200 py-2 text-sm"
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    disabled={saving_phone}
                    onClick={handle_save_phone}
                    className="flex-1 rounded-pill bg-accent text-accent-foreground py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {saving_phone ? 'сохраняем…' : 'сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-page px-3 py-2.5 text-sm font-medium text-neutral-900">
                {format_phone_display(profile.phone)}
              </p>
            )}
            <p className="mt-1.5 text-xs text-neutral-400">
              нужен для заказа — спросим перед оформлением, если не указан
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs text-neutral-500">дата рождения</label>
              {!editing_birthday && (
                <button
                  type="button"
                  onClick={() => {
                    set_birthday_draft(local.birthday);
                    set_editing_birthday(true);
                  }}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  изменить
                </button>
              )}
            </div>
            {editing_birthday ? (
              <div className="space-y-2">
                <input
                  type="date"
                  value={birthday_draft}
                  onChange={(e) => set_birthday_draft(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => set_editing_birthday(false)}
                    className="flex-1 rounded-pill border border-neutral-200 py-2 text-sm"
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    onClick={handle_save_birthday}
                    className="flex-1 rounded-pill bg-accent text-accent-foreground py-2 text-sm font-medium"
                  >
                    сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-page px-3 py-2.5 text-sm font-medium text-neutral-900">
                {format_birthday(local.birthday)}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs text-neutral-500">почта</label>
              {!editing_email && (
                <button
                  type="button"
                  onClick={() => {
                    set_email_draft(local.email);
                    set_editing_email(true);
                  }}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  изменить
                </button>
              )}
            </div>
            {editing_email ? (
              <div className="space-y-2">
                <input
                  type="email"
                  value={email_draft}
                  onChange={(e) => set_email_draft(e.target.value)}
                  placeholder="you@mail.ru"
                  className="w-full rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => set_editing_email(false)}
                    className="flex-1 rounded-pill border border-neutral-200 py-2 text-sm"
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    onClick={handle_save_email}
                    className="flex-1 rounded-pill bg-accent text-accent-foreground py-2 text-sm font-medium"
                  >
                    сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-page px-3 py-2.5 text-sm font-medium text-neutral-900">
                {local.email || 'не указана'}
              </p>
            )}
          </div>
        </section>

        {/* подписки */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft">
          <h2 className="text-lg font-bold text-neutral-900 mb-3">подписки</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={local.marketing_opt_in}
              onChange={handle_toggle_marketing}
              className="mt-1 h-4 w-4 rounded border-neutral-300 accent-[#0039A6]"
            />
            <span className="text-sm text-neutral-700 leading-snug">
              получать акции и предложения в push, SMS и на почту
            </span>
          </label>
        </section>

        {/* привязанные карты — только localStorage */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft space-y-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">привязанные карты</h2>
            <p className="text-xs text-neutral-400 mt-1">
              хранятся только на этом устройстве, не на сервере
            </p>
          </div>

          {local.cards.length === 0 ? (
            <p className="text-sm text-neutral-500">карт пока нет</p>
          ) : (
            <ul className="space-y-2">
              {local.cards.map((card) => (
                <li
                  key={card.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-page px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-neutral-900">
                    {card.brand} ···· {card.last4}
                  </span>
                  <button
                    type="button"
                    onClick={() => handle_remove_card(card.id)}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    удалить
                  </button>
                </li>
              ))}
            </ul>
          )}

          {adding_card ? (
            <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={card_brand}
                  onChange={(e) => set_card_brand(e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm"
                >
                  <option value="МИР">МИР</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="карта">другая</option>
                </select>
                <input
                  value={card_last4}
                  onChange={(e) => set_card_last4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4 цифры"
                  inputMode="numeric"
                  className="rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm"
                />
              </div>
              {card_error && <p className="text-xs text-red-500">{card_error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    set_adding_card(false);
                    set_card_error('');
                  }}
                  className="flex-1 rounded-pill border border-neutral-200 py-2 text-sm"
                >
                  отмена
                </button>
                <button
                  type="button"
                  onClick={handle_add_card}
                  className="flex-1 rounded-pill bg-accent text-accent-foreground py-2 text-sm font-medium"
                >
                  сохранить
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => set_adding_card(true)}
              className="text-sm font-semibold text-accent hover:underline"
            >
              + привязать карту
            </button>
          )}
        </section>

        {/* условия */}
        <section className="rounded-2xl bg-white p-5 sm:p-6 shadow-soft space-y-3">
          <h2 className="text-lg font-bold text-neutral-900 inline-flex items-center gap-2">
            <TapicoinIcon size={18} />
            условия получения тапикоинов
          </h2>
          <ul className="space-y-2.5">
            {bonus_earning_rules.map((rule) => (
              <li key={rule} className="flex gap-3 text-sm text-neutral-700 leading-snug">
                <span className="mt-0.5 shrink-0">
                  <TapicoinIcon size={14} />
                </span>
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

          {orders_error && <p className="text-sm text-red-500">{orders_error}</p>}

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
                const live =
                  o.status === 'new' || o.status === 'preparing' || o.status === 'ready';
                return (
                  <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={`/orders/${o.id}`}
                      className="flex items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">
                          № {format_order_number(o)}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {format_datetime(o.created_at)} · {status_label[o.status]}
                        </p>
                        {live ? (
                          <p className="mt-1 text-xs font-medium text-accent">следить за заказом →</p>
                        ) : (
                          <p className="mt-1 text-xs text-neutral-400">открыть заказ →</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {format_price(o.total_price)} ₽
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {payment_label[o.payment_type]}
                        </p>
                      </div>
                    </Link>
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
