'use client';

import { useRouter } from 'next/navigation';

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
      className="flex flex-col items-center gap-0.5 shrink-0"
      aria-label={`профиль, ${bonus} шариков`}
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface">
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
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-pink text-accent-foreground text-[10px] font-bold flex items-center justify-center">
            {bonus > 99 ? '99+' : bonus}
          </span>
        )}
      </span>
      <span className="text-[10px] font-semibold text-neutral-600 leading-none">
        {bonus} шар.
      </span>
    </button>
  );
}
