'use client';

import { useEffect, useState } from 'react';

type status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
};

export default function akciya_100_counter() {
  const [status, set_status] = useState<status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/akciya-100')
      .then((res) => res.json())
      .then((body: status) => {
        if (!cancelled && typeof body?.remaining === 'number') set_status(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const limit = status?.limit ?? 100;
  const remaining = status?.remaining ?? null;
  const redeemed = status?.redeemed_count ?? 0;
  const sold_out = status?.sold_out === true;
  const pct =
    remaining === null ? 100 : Math.round((remaining / Math.max(1, limit)) * 100);

  return (
    <div className="relative mt-6 overflow-hidden rounded-[28px] bg-[#111827] px-5 py-6 text-white shadow-[0_18px_50px_rgba(17,24,39,0.22)] sm:mt-7 sm:px-7 sm:py-7">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#ff6b6b]/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-white/10 blur-3xl"
      />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-[#ff9a9a]">
        бесплатные бабл ти
      </p>

      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-heading-soft text-[56px] font-bold leading-none tracking-tight tabular-nums sm:text-[72px]">
            {remaining === null ? '—' : sold_out ? '0' : remaining}
          </p>
          <p className="mt-2 text-base font-medium text-white/75">
            {sold_out
              ? 'все 100 бесплатных напитков уже выданы'
              : remaining === null
                ? 'считаем остаток…'
                : `из ${limit} ещё можно забрать`}
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
            выдано
          </p>
          <p className="mt-1 font-heading-soft text-3xl font-bold tabular-nums leading-none">
            {status ? redeemed : '—'}
          </p>
        </div>
      </div>

      <div className="relative mt-6">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/60">
          <span>осталось</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              sold_out ? 'bg-white/35' : 'bg-[#ff6b6b]'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
