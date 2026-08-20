'use client';

import { createElement, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import avatar_circle from '@/components/avatar-circle';
import { avatar_emoji_from_id } from '@/lib/avatar-emoji';
import { peek_header_user } from '@/lib/header-user';

const PLACEHOLDER_NAMES = new Set(['', 'профиль', 'аккаунт']);

function is_real_display_name(raw: string | null | undefined) {
  const name = (raw || '').trim().toLowerCase();
  return Boolean(name) && !PLACEHOLDER_NAMES.has(name);
}

type props = {
  is_logged_in: boolean;
  bonus?: number;
  user_name?: string | null;
  avatar_emoji?: string | null;
  avatar_bg?: string | null;
  avatar_url?: string | null;
  user_id?: string | null;
  on_login?: () => void;
  on_logout?: () => void;
};

function login_button(on_login?: () => void) {
  return (
    <button
      type="button"
      onClick={on_login}
      className="inline-flex items-center justify-center gap-2 rounded-pill bg-surface px-4 py-2.5 text-[15px] sm:text-base font-extrabold text-neutral-800 whitespace-nowrap transition-all duration-200 hover:bg-neutral-300 hover:scale-[1.03] hover:shadow-sm active:scale-[0.97]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="3.35" stroke="currentColor" strokeWidth="2" />
        <path
          d="M5.2 19.2c.85-3.15 3.4-4.7 6.8-4.7s5.95 1.55 6.8 4.7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      войти
    </button>
  );
}

export default function profile_chip({
  is_logged_in,
  bonus = 0,
  user_name,
  avatar_emoji,
  avatar_bg,
  avatar_url,
  user_id,
  on_login,
}: props) {
  const router = useRouter();
  const [cached, set_cached] = useState<ReturnType<typeof peek_header_user>>(null);

  useLayoutEffect(() => {
    set_cached(peek_header_user());
  }, [is_logged_in, user_id, user_name, avatar_url, avatar_emoji]);

  const shown =
    is_logged_in
      ? {
          id: user_id || cached?.id || null,
          name: user_name || cached?.name || '',
          emoji: avatar_emoji || cached?.avatar_emoji || null,
          bg: avatar_bg ?? cached?.avatar_bg ?? null,
          url: avatar_url || cached?.avatar_url || null,
          bonus,
        }
      : cached
        ? {
            id: cached.id,
            name: cached.name,
            emoji: cached.avatar_emoji,
            bg: cached.avatar_bg,
            url: cached.avatar_url || null,
            bonus: cached.bonus_balance,
          }
        : null;

  if (!shown) {
    return login_button(on_login);
  }

  const emoji =
    shown.emoji || (shown.id ? avatar_emoji_from_id(shown.id) : '🧋');
  const name = shown.name.trim();
  const bonus_label = shown.bonus > 999 ? '999+' : String(shown.bonus);

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className="group flex max-w-[10.5rem] items-center gap-2.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:max-w-[13rem]"
      aria-label={name ? `профиль ${name}, ${shown.bonus} бобаллов` : 'профиль'}
    >
      <span className="relative shrink-0">
        {createElement(avatar_circle, {
          emoji,
          bg: shown.bg,
          image_url: shown.url,
          user_id: shown.id,
          size: 'sm',
          className: 'transition group-hover:brightness-95',
        })}
        <span className="absolute -bottom-0.5 -right-1 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[#0039A6] px-1 py-[2px] text-[10px] font-bold leading-none tabular-nums text-white shadow-sm ring-2 ring-page">
          {bonus_label}
        </span>
      </span>
      {is_real_display_name(name) ? (
        <span className="min-w-0 truncate text-left text-[13px] font-bold leading-tight text-neutral-900 sm:text-sm">
          {name}
        </span>
      ) : null}
    </button>
  );
}
