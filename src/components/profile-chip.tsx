'use client';

import { useRouter } from 'next/navigation';
import TapicoinIcon from '@/components/tapicoin-icon';
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

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className="group flex max-w-[11.5rem] items-center gap-2 rounded-2xl bg-white/80 py-1.5 pl-1.5 pr-2 shadow-soft ring-1 ring-black/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98] sm:max-w-[14rem]"
      aria-label={`профиль ${name}, ${bonus} тапикоинов`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF4EC] text-[22px] leading-none ring-1 ring-black/[0.04]"
        aria-hidden
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-bold leading-tight text-neutral-900">
          {name}
        </span>
        <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#0039A6] px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
          <TapicoinIcon size={12} className="!bg-white !text-[#0039A6]" />
          <span className="truncate">{bonus}</span>
        </span>
      </span>
    </button>
  );
}
