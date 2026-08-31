'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type props = {
  /** page — на странице акции; story — кружок в ленте; card — карточка 2:3 */
  variant?: 'page' | 'story' | 'card';
};

function digit_reel({ value }: { value: number }) {
  const digit = ((value % 10) + 10) % 10;
  return (
    <span
      className="relative inline-block h-[1em] w-[0.58em] overflow-hidden align-top"
      aria-hidden
    >
      <span
        className="odometer-reel absolute left-0 top-0 flex w-full flex-col items-center"
        style={{ transform: `translate3d(0, ${-digit}em, 0)` }}
      >
        {DIGITS.map((n) => (
          <span
            key={n}
            className="flex h-[1em] w-full items-center justify-center font-heading-soft font-bold leading-none tabular-nums"
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

function format_places(n: number, places: number) {
  const safe = Math.max(0, Math.floor(n));
  return String(safe).padStart(places, '0').slice(-places);
}

export default function akciya_100_counter({ variant = 'page' }: props) {
  const [target, set_target] = useState<number | null>(null);
  const [display, set_display] = useState(100);
  const [sold_out, set_sold_out] = useState(false);
  const raf_ref = useRef<number | null>(null);
  const display_ref = useRef(100);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch('/api/akciya-100')
        .then((res) => res.json())
        .then((body: status) => {
          if (cancelled || typeof body?.remaining !== 'number') return;
          set_target(Math.max(0, body.remaining));
          set_sold_out(body.sold_out === true || body.remaining <= 0);
        })
        .catch(() => undefined);
    }

    load();
    const poll = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (target === null) return;

    if (raf_ref.current != null) {
      cancelAnimationFrame(raf_ref.current);
      raf_ref.current = null;
    }

    const from = display_ref.current;
    const to = target;
    if (from === to) {
      set_display(to);
      return;
    }

    const distance = Math.abs(from - to);
    const duration = Math.min(2800, 420 + distance * 48);
    const started = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 2.4);
      const next = Math.round(from + (to - from) * eased);
      if (next !== display_ref.current) {
        display_ref.current = next;
        set_display(next);
      }
      if (t < 1) {
        raf_ref.current = requestAnimationFrame(tick);
      } else {
        display_ref.current = to;
        set_display(to);
        raf_ref.current = null;
      }
    }

    raf_ref.current = requestAnimationFrame(tick);
    return () => {
      if (raf_ref.current != null) {
        cancelAnimationFrame(raf_ref.current);
        raf_ref.current = null;
      }
    };
  }, [target]);

  const places = format_places(display, 3);
  const hundreds = Number(places[0]);
  const tens = Number(places[1]);
  const ones = Number(places[2]);

  const aria =
    target === null
      ? 'считаем остаток'
      : sold_out
        ? 'бесплатные напитки закончились'
        : `осталось ${target} бесплатных бабл ти`;

  const label = sold_out ? 'закончились' : 'осталось бесплатных бабл ти';

  const reels = (
    <span className="flex items-start leading-none text-neutral-900" aria-hidden>
      {digit_reel({ value: hundreds })}
      {digit_reel({ value: tens })}
      {digit_reel({ value: ones })}
    </span>
  );

  if (variant === 'story') {
    // ширина как два кружка акций (136 + 12 + 136), высота как кружок
    return (
      <Link
        href="/akciya-pervye-100"
        className="flex h-[128px] w-[284px] flex-shrink-0 flex-col items-start justify-center rounded-[24px] bg-white px-5 shadow-[0_2px_14px_rgba(0,0,0,0.06)]"
        aria-label={aria}
      >
        <span className="text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-accent">
          {label}
        </span>
        <span className="mt-1 text-[3.25rem] leading-none">{reels}</span>
      </Link>
    );
  }

  if (variant === 'card') {
    // ширина как две карточки акций + gap
    return (
      <Link
        href="/akciya-pervye-100"
        className="relative flex h-[228px] w-[312px] flex-shrink-0 flex-col items-start justify-center overflow-hidden rounded-card bg-white px-5 shadow-[0_2px_14px_rgba(0,0,0,0.06)] sm:h-[270px] sm:w-[368px] sm:px-6"
        aria-label={aria}
      >
        <span className="text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-accent sm:text-xs">
          {label}
        </span>
        <span className="mt-2 text-[4rem] leading-none sm:text-[4.75rem]">{reels}</span>
      </Link>
    );
  }

  return (
    <div className="mt-6 sm:mt-7" aria-live="polite">
      <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-accent">{label}</p>
      <div
        className="mt-1.5 flex items-start text-[clamp(4.25rem,13vw,6.75rem)] leading-none text-neutral-900"
        aria-label={aria}
      >
        {reels}
      </div>
    </div>
  );
}
