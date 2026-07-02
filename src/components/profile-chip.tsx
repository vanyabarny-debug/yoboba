'use client';

import Link from 'next/link';
import { useState } from 'react';

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
  user_name,
  on_login,
  on_logout,
}: props) {
  const [sheet_open, set_sheet_open] = useState(false);

  if (!is_logged_in) {
    return (
      <button
        type="button"
        onClick={on_login}
        className="inline-flex items-center justify-center rounded-pill bg-accent text-accent-foreground px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
      >
        войти
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => set_sheet_open(true)}
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

      {sheet_open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/40"
            onClick={() => set_sheet_open(false)}
          />
          <div className="relative w-full bg-white rounded-t-2xl p-6 shadow-soft max-w-md">
            <h3 className="text-lg font-bold mb-1">{user_name || 'гость'}</h3>
            <p className="text-sm text-neutral-500 mb-4">
              накоплено <span className="font-semibold text-neutral-900">{bonus} шариков</span> тапиоки
            </p>
            <Link
              href="/shariki-tapioki"
              onClick={() => set_sheet_open(false)}
              className="block w-full text-center rounded-pill border border-surface py-3 text-sm font-medium mb-2"
            >
              про шарики
            </Link>
            <button
              type="button"
              onClick={() => {
                set_sheet_open(false);
                on_logout?.();
              }}
              className="w-full rounded-pill bg-surface py-3 text-sm font-medium text-neutral-700"
            >
              выйти
            </button>
          </div>
        </div>
      )}
    </>
  );
}
