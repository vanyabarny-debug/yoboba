'use client';

import { useRouter } from 'next/navigation';
import TapicoinIcon from '@/components/tapicoin-icon';

type props = {
  is_logged_in: boolean;
  bonus?: number;
  user_name?: string | null;
  on_login?: () => void;
  on_logout?: () => void;
};

export default function profile_chip({
  is_logged_in,
  bonus = 0,
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

  return (
    <button
      type="button"
      onClick={() => router.push('/profile')}
      className="group flex flex-col items-center gap-0.5 shrink-0 transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
      aria-label={`профиль, ${bonus} тапикоинов`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface ring-0 transition-all duration-200 group-hover:bg-[#0039A6] group-hover:text-white group-hover:ring-4 group-hover:ring-[#0039A6]/25 group-hover:scale-110">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {bonus > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0039A6] text-white text-[10px] font-bold flex items-center justify-center group-hover:bg-accent-pink">
            {bonus > 99 ? '99+' : bonus}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-600 leading-none group-hover:text-[#0039A6]">
        <TapicoinIcon size={10} className="group-hover:scale-110 transition-transform" />
        {bonus}
      </span>
    </button>
  );
}
