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

function DigitReel({ value }: { value: number }) {
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

function number_digits(n: number) {
  return String(Math.max(0, Math.floor(n))).split('').map((ch) => Number(ch));
}

export default function akciya_100_counter({ variant = 'page' }: props) {
  const [limit, set_limit] = useState(100);
  const [target, set_target] = useState<number | null>(null);
  const [display, set_display] = useState(100);
  const [sold_out, set_sold_out] = useState(false);
  const [play_id, set_play_id] = useState(0);
  const raf_ref = useRef<number | null>(null);
  const display_ref = useRef(100);
  const target_ref = useRef<number | null>(null);
  const limit_ref = useRef(100);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch('/api/akciya-100')
        .then((res) => res.json())
        .then((body: status) => {
          if (cancelled || typeof body?.remaining !== 'number') return;
          const next_limit = Math.max(1, Number(body.limit) || 100);
          const next_target = Math.max(0, body.remaining);
          limit_ref.current = next_limit;
          target_ref.current = next_target;
          set_limit(next_limit);
          set_target(next_target);
          set_sold_out(body.sold_out === true || next_target <= 0);
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

  // при загрузке и когда вкладка снова активна — проигрываем убывание
  useEffect(() => {
    function replay() {
      if (document.visibilityState !== 'visible') return;
      set_play_id((n) => n + 1);
    }

    replay();
    document.addEventListener('visibilitychange', replay);
    return () => {
      document.removeEventListener('visibilitychange', replay);
    };
  }, []);

  useEffect(() => {
    if (target === null) return;

    if (raf_ref.current != null) {
      cancelAnimationFrame(raf_ref.current);
      raf_ref.current = null;
    }

    const from = Math.max(target, limit_ref.current);
    const to = target;
    display_ref.current = from;
    set_display(from);

    if (from === to) return;

    const distance = Math.abs(from - to);
    const duration = Math.min(2600, 480 + distance * 42);
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
  }, [target, limit, play_id]);

  const digits = number_digits(display);

  const aria =
    target === null
      ? 'считаем остаток'
      : sold_out
        ? 'бесплатные напитки закончились'
        : `осталось ${target} бесплатных бабл ти`;

  const label = sold_out ? 'закончились' : 'осталось бесплатных бабл ти';

  const reels = (
    <span className="flex items-start leading-none text-neutral-900" aria-hidden>
      {digits.map((d, i) => (
        <DigitReel key={`${digits.length}-${i}`} value={d} />
      ))}
    </span>
  );

  if (variant === 'story') {
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
