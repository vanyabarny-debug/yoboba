'use client';

import { createElement } from 'react';
import { useRouter } from 'next/navigation';
import avatar_circle from '@/components/avatar-circle';
import { avatar_emoji_from_id } from '@/lib/avatar-emoji';

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
      className="inline-flex items-center justify-center rounded-pill bg-surface px-4 py-2.5 text-sm font-semibold text-neutral-800 whitespace-nowrap transition-all duration-200 hover:bg-neutral-300 hover:scale-[1.03] hover:shadow-sm active:scale-[0.97]"
    >
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

  // без настоящего входа — только «войти», без аватарки и подписей
  if (!is_logged_in || !is_real_display_name(user_name)) {
    return login_button(on_login);
  }

  const emoji =
    avatar_emoji || (user_id ? avatar_emoji_from_id(user_id) : '🧋');
  const name = (user_name || '').trim();
  const bonus_label = bonus > 999 ? '999+' : String(bonus);

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className="group flex max-w-[10.5rem] items-center gap-2.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:max-w-[13rem]"
      aria-label={`профиль ${name}, ${bonus} тапикоинов`}
    >
      <span className="relative shrink-0">
        {createElement(avatar_circle, {
          emoji,
          bg: avatar_bg,
          image_url: avatar_url,
          user_id,
          size: 'sm',
          className: 'transition group-hover:brightness-95',
        })}
        <span className="absolute -bottom-0.5 -right-1 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[#0039A6] px-1 py-[2px] text-[10px] font-bold leading-none tabular-nums text-white shadow-sm ring-2 ring-page">
          {bonus_label}
        </span>
      </span>
      <span className="min-w-0 truncate text-left text-[13px] font-bold leading-tight text-neutral-900 sm:text-sm">
        {name}
      </span>
    </button>
  );
}
