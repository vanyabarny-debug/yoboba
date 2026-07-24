'use client';

import { useRouter } from 'next/navigation';
import { avatar_emoji_from_id } from '@/lib/avatar-emoji';

type props = {
  is_logged_in: boolean;
  bonus?: number;
  user_name?: string | null;
  avatar_emoji?: string | null;
  user_id?: string | null;
  on_login?: () => void;
  on_logout?: () => void;
};

export default function profile_chip({
  is_logged_in,
  bonus = 0,
  user_name,
  avatar_emoji,
  user_id,
  on_login,
}: props) {
  const router = useRouter();

  if (!is_logged_in) {
    return (
      <button
        type="button"
        onClick={on_login}
        className="inline-flex items-center justify-center rounded-pill bg-surface px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-menu transition-colors whitespace-nowrap"
      >
        войти
      </button>
    );
  }

  const emoji =
    avatar_emoji || (user_id ? avatar_emoji_from_id(user_id) : '🧋');
  const name = (user_name || 'профиль').trim() || 'профиль';
  const bonus_label = bonus > 999 ? '999+' : String(bonus);

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className="group flex max-w-[10.5rem] items-center gap-2.5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:max-w-[13rem]"
      aria-label={`профиль ${name}, ${bonus} тапикоинов`}
    >
      <span className="relative shrink-0">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-[22px] leading-none ring-2 ring-accent/25 transition group-hover:bg-accent/25 group-hover:ring-accent/40"
          aria-hidden
        >
          {emoji}
        </span>
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
