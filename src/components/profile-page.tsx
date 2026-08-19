'use client';

import Link from 'next/link';
import { createElement, Suspense, useEffect, useState, type ReactNode } from 'react';
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
import { fetch_my_gifts, gift_items_label, gift_status_label } from '@/lib/gifts';
import { format_order_number } from '@/lib/order-number';
import type { gift, order } from '@/lib/types';
import { is_supabase_configured } from '@/lib/supabase/config';
import { get_demo_user, clear_session, set_demo_user } from '@/lib/demo-auth';
import {
  AVATAR_BG_POOL,
  AVATAR_EMOJI_CHANGE_COST,
  AVATAR_EMOJI_POOL,
  avatar_emoji_from_id,
  normalize_avatar_bg,
} from '@/lib/avatar-emoji';
import avatar_circle from '@/components/avatar-circle';
import {
  add_linked_card,
  clear_profile_local,
  format_card_expiry_input,
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
import { subscribe_to_push } from '@/components/pwa-register';

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
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const field_box =
  'w-full min-h-[52px] rounded-[12px] bg-[#f0f0f0] px-4 py-[13px] text-[16px] sm:text-[17px] font-medium text-neutral-900';
const field_input =
  'w-full min-h-[52px] rounded-[12px] bg-[#f0f0f0] px-4 py-[13px] text-[16px] sm:text-[17px] font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-accent/30';
const change_btn = 'shrink-0 text-[15px] font-medium text-accent hover:opacity-80';
const section_title =
  'text-[28px] sm:text-[32px] font-bold leading-[1.15] tracking-tight text-neutral-900';
const edit_actions = 'flex gap-2 pt-1';
const edit_cancel =
  'flex-1 rounded-pill border border-neutral-200 bg-white py-2.5 text-sm text-neutral-600 hover:bg-neutral-50';
const edit_save =
  'flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-60';

function change_link({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={change_btn}>
      {children}
    </button>
  );
}

function field_label({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-[15px] text-neutral-400">{label}</span>
      {action}
    </div>
  );
}

function banner_heart() {
  return (
    <svg
      viewBox="0 0 88 80"
      className="h-[88px] w-[96px] drop-shadow-[0_8px_16px_rgba(120,0,40,0.28)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="profile-heart" x1="18%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ffe1ea" />
          <stop offset="45%" stopColor="#ff8aa8" />
          <stop offset="100%" stopColor="#ff3d6e" />
        </linearGradient>
      </defs>
      <path
        fill="url(#profile-heart)"
        d="M44 76C18 58 2 42 2 24 2 11.5 12 2 24.5 2 32.5 2 39 6.5 44 14 49 6.5 55.5 2 63.5 2 76 2 86 11.5 86 24c0 18-16 34-42 52z"
      />
      <path
        fill="rgba(255,255,255,0.45)"
        d="M24 16c-6 2-10 8-10 15 0 1.2.1 2.3.4 3.4C16.5 24 24 18 34 16c-3-2-6.5-2.2-10 0z"
      />
    </svg>
  );
}

function card_brand_mark({ brand }: { brand: string }) {
  const key = brand.toLowerCase();
  if (key.includes('visa')) {
    return (
      <span className="inline-flex h-7 w-11 items-center justify-center rounded-[4px] bg-[#1a1f71] text-[10px] font-black tracking-wide text-white">
        VISA
      </span>
    );
  }
  if (key.includes('master') || key === 'mc') {
    return (
      <span className="relative inline-flex h-7 w-11 items-center justify-center rounded-[4px] bg-[#1b1b1b]">
        <span className="absolute left-[9px] h-4 w-4 rounded-full bg-[#eb001b]" />
        <span className="absolute right-[9px] h-4 w-4 rounded-full bg-[#f79e1b]" />
      </span>
    );
  }
  if (key.includes('мир') || key.includes('mir')) {
    return (
      <span className="inline-flex h-7 w-11 items-center justify-center rounded-[4px] bg-white ring-1 ring-black/10">
        <span className="text-[9px] font-black tracking-wide text-[#0d4ea6]">МИР</span>
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 max-w-[4.5rem] items-center justify-center truncate rounded-[4px] bg-neutral-200 px-1.5 text-[10px] font-bold text-neutral-600">
      {brand}
    </span>
  );
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
  const [inbox_gifts, set_inbox_gifts] = useState<gift[]>([]);
  const [sent_gifts, set_sent_gifts] = useState<gift[]>([]);
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
  const [card_expires, set_card_expires] = useState('');
  const [card_error, set_card_error] = useState('');
  const [adding_card, set_adding_card] = useState(false);
  const [deleting_profile, set_deleting_profile] = useState(false);
  const [editing_avatar, set_editing_avatar] = useState(false);
  const [avatar_draft, set_avatar_draft] = useState('');
  const [avatar_bg_draft, set_avatar_bg_draft] = useState<string | null>(null);
  const [saving_avatar, set_saving_avatar] = useState(false);
  const [avatar_error, set_avatar_error] = useState('');
  const [rules_open, set_rules_open] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      set_loading(true);

      if (demo_mode) {
        const u = get_demo_user();
        if (!u || u.is_guest || u.role !== 'user') {
          router.replace('/login?returnUrl=/');
          return;
        }
        if (!cancelled) {
          const p = {
            id: u.id,
            phone: u.phone || null,
            name: u.name,
            bonus_balance: u.bonus_balance,
            avatar_emoji: u.avatar_emoji || avatar_emoji_from_id(u.id),
            avatar_bg: u.avatar_bg ?? null,
            role: 'user' as const,
          };
          set_profile(p);
          const loc = get_profile_local(u.id);
          set_local(loc);
          set_email_draft(loc.email);
          set_birthday_draft(loc.birthday);
          set_orders([]);
          const { inbox, sent } = await fetch_my_gifts({
            id: u.id,
            name: u.name,
            phone: u.phone || null,
          });
          if (!cancelled) {
            set_inbox_gifts(inbox);
            set_sent_gifts(sent);
            set_loading(false);
          }
        }
        return;
      }

      let auth = await get_auth_state();
      for (let attempt = 0; attempt < 6 && !auth.is_permanent; attempt++) {
        await new Promise((r) => setTimeout(r, 150 + attempt * 80));
        auth = await get_auth_state();
      }
      if (!auth.is_permanent || !auth.user_id) {
        router.replace('/login?returnUrl=/profile');
        return;
      }

      const resolved =
        auth.profile ||
        ({
          id: auth.user_id,
          phone: null,
          name: null,
          bonus_balance: 0,
          avatar_emoji: null,
          avatar_bg: null,
          role: 'user' as const,
        } satisfies profile);

      if (cancelled) return;
      set_profile(resolved);
      set_name_draft(resolved.name || '');
      let loc = get_profile_local(resolved.id);
      loc = await seed_local_from_vk(resolved.id, loc);
      if (cancelled) return;
      set_local(loc);
      set_email_draft(loc.email);
      set_birthday_draft(loc.birthday);

      const { data, error } = await fetch_my_orders();
      const gifts = await fetch_my_gifts({
        id: resolved.id,
        name: resolved.name || 'гость',
        phone: resolved.phone,
      });
      if (!cancelled) {
        set_orders(data);
        set_orders_error(error ? error.message : '');
        set_inbox_gifts(gifts.inbox);
        set_sent_gifts(gifts.sent);
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
      if (demo_mode) {
        const u = get_demo_user();
        if (!u) {
          set_name_error('не удалось сохранить');
          return;
        }
        const updated = { ...u, name: next };
        set_demo_user(updated);
        set_profile({ ...profile, name: next });
        set_editing_name(false);
        return;
      }

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

  async function handle_change_avatar() {
    if (!profile || !avatar_draft) return;
    const current_emoji = profile.avatar_emoji || avatar_emoji_from_id(profile.id);
    const current_bg = normalize_avatar_bg(profile.avatar_bg);
    const next_bg = normalize_avatar_bg(avatar_bg_draft);
    const emoji_changed = avatar_draft !== current_emoji;
    const bg_changed = current_bg !== next_bg;

    if (!emoji_changed && !bg_changed) {
      set_editing_avatar(false);
      return;
    }
    if (emoji_changed && profile.bonus_balance < AVATAR_EMOJI_CHANGE_COST) {
      set_avatar_error(
        `нужно ${AVATAR_EMOJI_CHANGE_COST} тапикоинов на смену эмоджи, у вас ${profile.bonus_balance}`
      );
      return;
    }

    set_saving_avatar(true);
    set_avatar_error('');

    try {
      if (demo_mode) {
        const u = get_demo_user();
        if (!u) {
          set_avatar_error('не удалось сменить');
          return;
        }
        const next_balance = emoji_changed
          ? Math.max(0, u.bonus_balance - AVATAR_EMOJI_CHANGE_COST)
          : u.bonus_balance;
        const updated = {
          ...u,
          avatar_emoji: avatar_draft,
          avatar_bg: next_bg,
          bonus_balance: next_balance,
        };
        set_demo_user(updated);
        set_profile({
          ...profile,
          avatar_emoji: avatar_draft,
          avatar_bg: next_bg,
          bonus_balance: next_balance,
        });
        set_editing_avatar(false);
        return;
      }

      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: avatar_draft, bg: next_bg }),
      });
      const body = (await res.json()) as {
        profile?: profile;
        error?: string;
        bonus_balance?: number;
        avatar_emoji?: string;
        avatar_bg?: string | null;
      };
      if (!res.ok) {
        set_avatar_error(body.error || 'не удалось сменить');
        return;
      }
      if (body.profile) {
        set_profile(body.profile);
      } else {
        set_profile({
          ...profile,
          avatar_emoji: body.avatar_emoji || avatar_draft,
          avatar_bg: body.avatar_bg !== undefined ? body.avatar_bg : next_bg,
          bonus_balance:
            typeof body.bonus_balance === 'number'
              ? body.bonus_balance
              : emoji_changed
                ? profile.bonus_balance - AVATAR_EMOJI_CHANGE_COST
                : profile.bonus_balance,
        });
      }
      set_editing_avatar(false);
    } catch {
      set_avatar_error('не удалось сменить');
    } finally {
      set_saving_avatar(false);
    }
  }

  function handle_save_email() {
    if (!profile || !local) return;
    persist_local({ ...local, email: email_draft.trim() });
    set_editing_email(false);
  }

  function handle_save_birthday() {
    if (!profile || !local) return;
    if (local.birthday_locked) {
      set_editing_birthday(false);
      return;
    }
    if (!birthday_draft) return;
    persist_local({ ...local, birthday: birthday_draft, birthday_locked: true });
    set_editing_birthday(false);
  }

  async function handle_toggle_marketing() {
    if (!profile || !local) return;
    const next = !local.marketing_opt_in;
    persist_local({ ...local, marketing_opt_in: next });
    if (next) {
      await subscribe_to_push(profile.id);
    }
  }

  function handle_add_card() {
    if (!profile) return;
    set_card_error('');
    try {
      const next = add_linked_card(profile.id, {
        brand: card_brand,
        last4: card_last4,
        expires: card_expires,
      });
      set_local(next);
      set_card_last4('');
      set_card_expires('');
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

  async function handle_delete_profile() {
    if (
      !confirm(
        'удалить профиль? данные на этом устройстве сотрутся, вы выйдете из аккаунта'
      )
    ) {
      return;
    }

    set_deleting_profile(true);
    try {
      if (profile) clear_profile_local(profile.id);
      if (demo_mode) {
        await clear_session();
      } else {
        await fetch('/api/auth/profile', {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        await sign_out();
      }
      router.push('/');
    } finally {
      set_deleting_profile(false);
    }
  }

  const left_to_drink = Math.max(
    0,
    FREE_DRINK_BONUS_THRESHOLD - (profile?.bonus_balance || 0)
  );
  const tapicoin_progress = Math.min(
    100,
    ((profile?.bonus_balance || 0) / FREE_DRINK_BONUS_THRESHOLD) * 100
  );

  const content =
    loading || !profile || !local ? (
      <div className="page-shell py-12">
        <p className="text-neutral-400">загрузка профиля…</p>
      </div>
    ) : (
      <div className="page-shell overflow-x-hidden py-8 sm:py-10 pb-[calc(5rem+var(--safe-bottom))]">
        <div className="w-full min-w-0 max-w-3xl space-y-10 sm:space-y-12">
        <section className="relative overflow-hidden rounded-[20px] bg-[linear-gradient(100deg,#ff2d6a_0%,#ff4d7d_42%,#ff6b6b_100%)] px-5 py-5 sm:px-7 sm:py-6 text-white">
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pr-2">
              <p className="text-[15px] sm:text-base font-medium leading-snug">
                ваши тапикоины
              </p>
              <p className="mt-2 inline-flex items-center gap-2 text-[34px] sm:text-[40px] font-bold leading-none tabular-nums">
                <TapicoinIcon size={28} className="bg-white/20" />
                {profile.bonus_balance}
              </p>
              <p className="mt-3 text-sm sm:text-[15px] leading-snug text-white/90">
                до бесплатного напитка:{' '}
                <span className="font-semibold">{left_to_drink}</span>
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${tapicoin_progress}%` }}
                />
              </div>
            </div>
            <div className="pointer-events-none shrink-0 -mt-1 -mr-1 sm:-mr-2">
              {banner_heart()}
            </div>
          </div>
          <button
            type="button"
            onClick={() => set_rules_open((open) => !open)}
            className="relative z-10 mt-4 inline-flex items-center gap-1.5 text-sm sm:text-[15px] font-semibold text-white/95 hover:text-white"
            aria-expanded={rules_open}
          >
            условия получения
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
              className={`transition-transform ${rules_open ? 'rotate-180' : ''}`}
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {rules_open && (
            <ul className="relative z-10 mt-3 space-y-2 border-t border-white/20 pt-3">
              {bonus_earning_rules.map((rule) => (
                <li
                  key={rule}
                  className="text-[13px] sm:text-sm font-medium leading-snug text-white/90"
                >
                  {rule}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-5">
          <h1 className={section_title}>личные данные</h1>

          <div>
            {field_label({
              label: 'аватар',
              action: !editing_avatar
                ? change_link({
                    children: 'изменить',
                    onClick: () => {
                      set_avatar_draft(
                        profile.avatar_emoji || avatar_emoji_from_id(profile.id)
                      );
                      set_avatar_bg_draft(normalize_avatar_bg(profile.avatar_bg));
                      set_avatar_error('');
                      set_editing_avatar(true);
                    },
                  })
                : null,
            })}
            {editing_avatar ? (
              <div className="space-y-4">
                <div className={`${field_box} flex items-center gap-3`}>
                  {createElement(avatar_circle, {
                    emoji: avatar_draft,
                    bg: avatar_bg_draft,
                    image_url: profile.avatar_url,
                    user_id: profile.id,
                    size: 'lg',
                  })}
                  <p className="text-[13px] font-normal text-neutral-500 leading-relaxed">
                    эмоджи — {AVATAR_EMOJI_CHANGE_COST} т., цвет фона бесплатно.
                    {profile.bonus_balance < AVATAR_EMOJI_CHANGE_COST
                      ? ` у вас ${profile.bonus_balance} т.`
                      : ` · баланс ${profile.bonus_balance} т.`}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-[13px] text-neutral-400">эмоджи</p>
                  <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
                    {AVATAR_EMOJI_POOL.map((emoji) => {
                      const selected = avatar_draft === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => set_avatar_draft(emoji)}
                          className={`flex h-11 w-full items-center justify-center rounded-[12px] text-2xl transition ${
                            selected
                              ? 'bg-accent/15 ring-2 ring-accent'
                              : 'bg-[#f0f0f0] hover:bg-neutral-200'
                          }`}
                          aria-label={`выбрать ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[13px] text-neutral-400">цвет фона</p>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_BG_POOL.map((swatch) => {
                      const value = swatch.color;
                      const selected =
                        normalize_avatar_bg(avatar_bg_draft) === value;
                      return (
                        <button
                          key={swatch.id}
                          type="button"
                          onClick={() => set_avatar_bg_draft(value)}
                          title={swatch.label}
                          className={`h-9 w-9 rounded-full ring-2 transition ${
                            selected ? 'ring-accent scale-110' : 'ring-black/10 hover:ring-black/20'
                          } ${swatch.color ? '' : 'bg-accent/15'}`}
                          style={swatch.color ? { backgroundColor: swatch.color } : undefined}
                          aria-label={swatch.label}
                        />
                      );
                    })}
                  </div>
                </div>

                {avatar_error && <p className="text-xs text-red-500">{avatar_error}</p>}
                <div className={edit_actions}>
                  <button
                    type="button"
                    onClick={() => set_editing_avatar(false)}
                    className={edit_cancel}
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    disabled={
                      saving_avatar ||
                      !avatar_draft ||
                      (avatar_draft ===
                        (profile.avatar_emoji || avatar_emoji_from_id(profile.id)) &&
                        normalize_avatar_bg(avatar_bg_draft) ===
                          normalize_avatar_bg(profile.avatar_bg)) ||
                      (avatar_draft !==
                        (profile.avatar_emoji || avatar_emoji_from_id(profile.id)) &&
                        profile.bonus_balance < AVATAR_EMOJI_CHANGE_COST)
                    }
                    onClick={() => void handle_change_avatar()}
                    className={edit_save}
                  >
                    {saving_avatar
                      ? 'сохраняем…'
                      : avatar_draft !==
                          (profile.avatar_emoji || avatar_emoji_from_id(profile.id))
                        ? `сохранить (−${AVATAR_EMOJI_CHANGE_COST} т.)`
                        : 'сохранить цвет'}
                  </button>
                </div>
              </div>
            ) : (
              <div className={`${field_box} flex items-center gap-3`}>
                {createElement(avatar_circle, {
                  emoji: profile.avatar_emoji,
                  bg: profile.avatar_bg,
                  image_url: profile.avatar_url,
                  user_id: profile.id,
                  size: 'sm',
                })}
                <span className="text-[16px] sm:text-[17px] font-medium text-neutral-900">
                  ваш аватар
                </span>
              </div>
            )}
          </div>

          <div>
            {field_label({
              label: 'имя',
              action: !editing_name
                ? change_link({
                    children: 'изменить',
                    onClick: () => {
                      set_name_draft(profile.name || '');
                      set_editing_name(true);
                      set_name_error('');
                    },
                  })
                : null,
            })}
            {editing_name ? (
              <div className="space-y-2">
                <input
                  value={name_draft}
                  onChange={(e) => set_name_draft(e.target.value)}
                  className={field_input}
                  autoFocus
                />
                {name_error && <p className="text-xs text-red-500">{name_error}</p>}
                <div className={edit_actions}>
                  <button
                    type="button"
                    onClick={() => set_editing_name(false)}
                    className={edit_cancel}
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    disabled={saving_name}
                    onClick={handle_save_name}
                    className={edit_save}
                  >
                    {saving_name ? 'сохраняем…' : 'сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={field_box}>{profile.name || 'гость'}</p>
            )}
          </div>

          <div>
            {field_label({
              label: 'телефон',
              action: !editing_phone
                ? change_link({
                    children: profile.phone ? 'изменить' : 'указать',
                    onClick: () => {
                      const digits = (profile.phone || '').replace(/\D/g, '');
                      const local = digits.startsWith('7') ? digits.slice(1) : digits;
                      set_phone_draft(format_phone_input(local));
                      set_editing_phone(true);
                      set_phone_error('');
                    },
                  })
                : null,
            })}
            {editing_phone ? (
              <div className="space-y-2">
                <div className={`${field_box} flex items-center`}>
                  <span className="pr-2 text-[16px] sm:text-[17px] font-medium text-neutral-400">
                    +7
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone_draft}
                    onChange={(e) => set_phone_draft(format_phone_input(e.target.value))}
                    placeholder="916 000-00-00"
                    className="min-w-0 flex-1 bg-transparent text-[16px] sm:text-[17px] font-medium text-neutral-900 outline-none"
                    autoFocus
                  />
                </div>
                {phone_error && <p className="text-xs text-red-500">{phone_error}</p>}
                <div className={edit_actions}>
                  <button
                    type="button"
                    onClick={() => set_editing_phone(false)}
                    className={edit_cancel}
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    disabled={saving_phone}
                    onClick={handle_save_phone}
                    className={edit_save}
                  >
                    {saving_phone ? 'сохраняем…' : 'сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={field_box}>{format_phone_display(profile.phone)}</p>
            )}
            <p className="mt-2 text-[13px] font-normal text-neutral-400">
              нужен для заказа — спросим перед оформлением, если не указан
            </p>
          </div>

          <div>
            {field_label({
              label: 'дата рождения',
              action:
                !editing_birthday && !local.birthday_locked
                  ? change_link({
                      children: local.birthday ? 'изменить' : 'указать',
                      onClick: () => {
                        set_birthday_draft(local.birthday);
                        set_editing_birthday(true);
                      },
                    })
                  : null,
            })}
            {editing_birthday && !local.birthday_locked ? (
              <div className="space-y-2">
                <input
                  type="date"
                  value={birthday_draft}
                  onChange={(e) => set_birthday_draft(e.target.value)}
                  className={field_input}
                />
                <p className="text-[13px] font-normal text-neutral-400">
                  после сохранения изменить дату больше нельзя
                </p>
                <div className={edit_actions}>
                  <button
                    type="button"
                    onClick={() => set_editing_birthday(false)}
                    className={edit_cancel}
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    disabled={!birthday_draft}
                    onClick={handle_save_birthday}
                    className={edit_save}
                  >
                    сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className={field_box}>{format_birthday(local.birthday)}</p>
            )}
            {local.birthday_locked ? (
              <p className="mt-2 text-[13px] font-normal text-neutral-400">
                дату рождения можно указать один раз
              </p>
            ) : !editing_birthday ? (
              <p className="mt-2 text-[13px] font-normal text-neutral-400">
                можно указать один раз
              </p>
            ) : null}
          </div>

          <div>
            {field_label({
              label: 'почта',
              action: !editing_email
                ? change_link({
                    children: 'изменить',
                    onClick: () => {
                      set_email_draft(local.email);
                      set_editing_email(true);
                    },
                  })
                : null,
            })}
            {editing_email ? (
              <div className="space-y-2">
                <input
                  type="email"
                  value={email_draft}
                  onChange={(e) => set_email_draft(e.target.value)}
                  placeholder="you@mail.ru"
                  className={field_input}
                  autoFocus
                />
                <div className={edit_actions}>
                  <button
                    type="button"
                    onClick={() => set_editing_email(false)}
                    className={edit_cancel}
                  >
                    отмена
                  </button>
                  <button
                    type="button"
                    onClick={handle_save_email}
                    className={edit_save}
                  >
                    сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className={field_box}>{local.email || 'не указана'}</p>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className={section_title}>подписки</h2>
          <button
            type="button"
            role="checkbox"
            aria-checked={local.marketing_opt_in}
            onClick={handle_toggle_marketing}
            className="flex w-full items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 transition ${
                local.marketing_opt_in
                  ? 'border-accent bg-accent text-white'
                  : 'border-neutral-300 bg-white'
              }`}
              aria-hidden
            >
              {local.marketing_opt_in ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.2L4.8 8.6L9.5 3.4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span>
              <span className="block text-[16px] sm:text-[17px] font-medium text-neutral-900">
                email-рассылка
              </span>
              <span className="mt-1 block text-[13px] font-normal leading-snug text-neutral-400">
                получать акции в пуш-шторке, SMS и на почту
              </span>
            </span>
          </button>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className={section_title}>привязанные карты</h2>
            <p className="mt-2 text-[13px] font-normal text-neutral-400">
              хранятся только на этом устройстве, не на сервере
            </p>
          </div>

          {local.cards.length === 0 ? (
            <p className="text-[15px] text-neutral-400">карт пока нет</p>
          ) : (
            <ul className="space-y-2">
              {local.cards.map((card) => (
                <li
                  key={card.id}
                  className={`${field_box} flex items-center justify-between gap-3`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {card_brand_mark({ brand: card.brand })}
                    <span className="truncate tabular-nums">
                      ···· {card.last4}
                      {card.expires ? (
                        <span className="ml-3 font-normal text-neutral-400">
                          {card.expires}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handle_remove_card(card.id)}
                    className={change_btn}
                  >
                    удалить
                  </button>
                </li>
              ))}
            </ul>
          )}

          {adding_card ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={card_brand}
                  onChange={(e) => set_card_brand(e.target.value)}
                  className={field_input}
                >
                  <option value="МИР">МИР</option>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="карта">другая</option>
                </select>
                <input
                  value={card_last4}
                  onChange={(e) =>
                    set_card_last4(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="4 цифры"
                  inputMode="numeric"
                  className={field_input}
                />
                <input
                  value={card_expires}
                  onChange={(e) =>
                    set_card_expires(format_card_expiry_input(e.target.value))
                  }
                  placeholder="мм/гг"
                  inputMode="numeric"
                  className={field_input}
                />
              </div>
              {card_error && <p className="text-xs text-red-500">{card_error}</p>}
              <div className={edit_actions}>
                <button
                  type="button"
                  onClick={() => {
                    set_adding_card(false);
                    set_card_error('');
                  }}
                  className={edit_cancel}
                >
                  отмена
                </button>
                <button type="button" onClick={handle_add_card} className={edit_save}>
                  сохранить
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => set_adding_card(true)}
              className="text-[15px] font-medium text-accent hover:opacity-80"
            >
              + привязать карту
            </button>
          )}
        </section>

        <section className="space-y-5">
          <h2 className={section_title}>подарки</h2>
          {inbox_gifts.length === 0 && sent_gifts.length === 0 ? (
            <div>
              <p className="text-[15px] text-neutral-400 mb-4">
                пока нет подарков — можно отправить напиток другу по номеру
              </p>
              <Link
                href="/?gift=1"
                className="inline-flex rounded-pill bg-accent text-accent-foreground px-5 py-2.5 text-sm font-medium"
              >
                подарить напиток
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {inbox_gifts.map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 rounded-[12px] bg-[#f0f0f0] px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-neutral-900">
                      от {g.sender_name}
                    </p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                      {gift_items_label(g.items)} · {gift_status_label[g.status]}
                    </p>
                    {g.message ? (
                      <p className="mt-1 text-[13px] text-neutral-600">«{g.message}»</p>
                    ) : null}
                  </div>
                  {g.status === 'paid' ? (
                    <Link
                      href={`/?claim_gift=${encodeURIComponent(g.id)}`}
                      className="shrink-0 text-[15px] font-medium text-accent"
                    >
                      забрать
                    </Link>
                  ) : g.order_id ? (
                    <Link
                      href={`/orders/${g.order_id}`}
                      className="shrink-0 text-[15px] font-medium text-accent"
                    >
                      заказ
                    </Link>
                  ) : (
                    <span className="shrink-0 text-[13px] text-neutral-400">
                      {format_price(g.total_price)} ₽
                    </span>
                  )}
                </div>
              ))}
              {sent_gifts.map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 rounded-[12px] bg-[#f0f0f0] px-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-neutral-900">
                      для {format_phone_display(g.recipient_phone)}
                    </p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                      {gift_items_label(g.items)} · {gift_status_label[g.status]}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] tabular-nums text-neutral-500">
                    {format_price(g.total_price)} ₽
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <h2 className={section_title}>история заказов</h2>

          {orders_error && <p className="text-sm text-red-500">{orders_error}</p>}

          {orders.length === 0 && !orders_error ? (
            <div>
              <p className="text-[15px] text-neutral-400 mb-4">
                вы ещё ничего не заказывали
              </p>
              <Link
                href="/"
                className="inline-flex rounded-pill bg-accent text-accent-foreground px-5 py-2.5 text-sm font-medium"
              >
                в меню
              </Link>
            </div>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[13px] font-normal text-neutral-400">
                    <th className="pb-3 pr-4 font-normal">№</th>
                    <th className="pb-3 pr-4 font-normal">дата и время</th>
                    <th className="pb-3 pr-4 font-normal">сумма</th>
                    <th className="pb-3 font-normal">статус</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const live =
                      o.status === 'new' ||
                      o.status === 'preparing' ||
                      o.status === 'ready';
                    const composition = o.items
                      .map((item) => item.name)
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <tr key={o.id} className="border-t border-neutral-100">
                        <td className="py-3.5 pr-4 align-top">
                          <Link
                            href={`/orders/${o.id}`}
                            className="text-[15px] font-medium tabular-nums text-neutral-900"
                          >
                            {format_order_number(o)}
                          </Link>
                        </td>
                        <td className="py-3.5 pr-4 align-top text-[15px] font-normal text-neutral-600">
                          {format_datetime(o.created_at)}
                        </td>
                        <td className="py-3.5 pr-4 align-top">
                          <p className="text-[15px] font-medium tabular-nums text-neutral-900">
                            {format_price(o.total_price)} ₽
                          </p>
                          <p className="mt-0.5 max-w-[16rem] truncate text-[13px] font-normal text-neutral-400">
                            {composition || payment_label[o.payment_type]}
                          </p>
                        </td>
                        <td className="py-3.5 align-top">
                          <Link
                            href={`/orders/${o.id}`}
                            className={`text-[15px] font-medium ${
                              o.status === 'cancelled'
                                ? 'text-neutral-400'
                                : 'text-accent'
                            }`}
                          >
                            {status_label[o.status]}
                            {live ? ' →' : ''}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() => void handle_logout()}
            className="text-[16px] sm:text-[17px] font-medium text-neutral-500 hover:text-neutral-800"
          >
            выйти
          </button>
          <button
            type="button"
            disabled={deleting_profile}
            onClick={() => void handle_delete_profile()}
            className="text-[16px] sm:text-[17px] font-medium text-neutral-300 hover:text-red-400 disabled:opacity-60"
          >
            {deleting_profile ? 'удаляем…' : 'удалить профиль'}
          </button>
        </div>
        </div>
      </div>
    );

  return createElement(
    Suspense,
    { fallback: <div className="min-h-screen bg-page" /> },
    createElement(site_chrome, null, content)
  );
}
