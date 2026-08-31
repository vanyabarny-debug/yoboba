'use client';

import { useEffect, useState } from 'react';

type status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
};

export default function akciya_25k_counter() {
  const [status, set_status] = useState<status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/akciya-25k')
      .then((res) => res.json())
      .then((body: status) => {
        if (!cancelled && typeof body?.remaining === 'number') set_status(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) {
    return (
      <div className="mt-6 rounded-[20px] border border-surface bg-white px-4 py-4 text-sm text-neutral-500">
        загружаем счётчик…
      </div>
    );
  }

  const pct = Math.round((status.remaining / status.limit) * 100);

  return (
    <div className="mt-6 overflow-hidden rounded-[20px] border border-surface bg-white p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
            бесплатные напитки
          </p>
          <p className="mt-2 font-heading-soft text-3xl font-bold leading-none text-neutral-900 tabular-nums">
            {status.sold_out ? 'закончились' : status.remaining}
            {!status.sold_out && (
              <span className="ml-1 text-lg font-semibold text-neutral-400">
                / {status.limit}
              </span>
            )}
          </p>
          <p className="mt-2 text-sm font-medium text-neutral-600">
            {status.sold_out
              ? 'все бесплатные бабл ти по этой акции уже выданы'
              : `осталось бесплатных бабл ти · выдано ${status.redeemed_count}`}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full transition-all ${
            status.sold_out ? 'bg-neutral-300' : 'bg-accent'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
