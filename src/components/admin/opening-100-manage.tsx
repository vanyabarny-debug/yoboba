'use client';

import { useEffect, useState } from 'react';

type status = {
  limit: number;
  redeemed_count: number;
  remaining: number;
  sold_out: boolean;
  manual_redeemed: number;
  punched_count: number;
  manual_updated_at: string | null;
  manual_updated_by: string | null;
  error?: string;
};

function format_when(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function opening_100_manage() {
  const [data, set_data] = useState<status | null>(null);
  const [remaining_draft, set_remaining_draft] = useState('');
  const [limit_draft, set_limit_draft] = useState('');
  const [error, set_error] = useState('');
  const [saved, set_saved] = useState(false);
  const [busy, set_busy] = useState(false);

  function apply(body: status) {
    set_data(body);
    set_remaining_draft(String(body.remaining));
    set_limit_draft(String(body.limit));
  }

  useEffect(() => {
    fetch('/api/admin/opening-100', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: status) => {
        if (body.error) {
          set_error(body.error);
          return;
        }
        apply(body);
      })
      .catch(() => set_error('не удалось загрузить счётчик акции'));
  }, []);

  async function save(next_remaining: number, next_limit?: number) {
    set_busy(true);
    set_error('');
    set_saved(false);
    try {
      const res = await fetch('/api/admin/opening-100', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          remaining: next_remaining,
          limit: next_limit ?? data?.limit,
        }),
      });
      const body = (await res.json()) as status;
      if (!res.ok) {
        set_error(body.error || 'не удалось сохранить остаток');
        return;
      }
      apply(body);
      set_saved(true);
      window.setTimeout(() => set_saved(false), 2000);
    } catch {
      set_error('не удалось сохранить остаток');
    } finally {
      set_busy(false);
    }
  }

  function handle_submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const next_limit = Math.max(1, Math.round(Number(limit_draft) || data.limit));
    const next_remaining = Math.max(
      0,
      Math.min(next_limit, Math.round(Number(remaining_draft) || 0))
    );
    void save(next_remaining, next_limit);
  }

  function step(delta: number) {
    if (!data) return;
    const base = Math.round(Number(remaining_draft) || 0);
    const next = Math.max(0, Math.min(data.limit, base + delta));
    set_remaining_draft(String(next));
    void save(next);
  }

  const updated = data ? format_when(data.manual_updated_at) : null;

  return (
    <div className="rounded-card border border-surface bg-white p-4 shadow-soft">
      <p className="text-sm font-semibold text-neutral-900">акция · 100 напитков</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        остаток на сайте и на кассе — можно править руками
      </p>

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}

      {!data && !error ? (
        <p className="mt-3 text-sm text-neutral-400">загрузка…</p>
      ) : null}

      {data && (
        <>
          <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-accent">
            {data.remaining}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            выдано {data.redeemed_count} из {data.limit} · кассой {data.punched_count}
            {data.manual_redeemed !== 0
              ? ` · вручную ${data.manual_redeemed > 0 ? '+' : ''}${data.manual_redeemed}`
              : ''}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || data.remaining <= 0}
              onClick={() => step(-1)}
              className="h-9 flex-1 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-700 disabled:opacity-40"
            >
              −1 выдали
            </button>
            <button
              type="button"
              disabled={busy || data.remaining >= data.limit}
              onClick={() => step(1)}
              className="h-9 flex-1 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-700 disabled:opacity-40"
            >
              +1 вернуть
            </button>
          </div>

          <form onSubmit={handle_submit} className="mt-3 space-y-2">
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="text-xs text-neutral-500">осталось</span>
                <input
                  type="number"
                  min={0}
                  max={data.limit}
                  value={remaining_draft}
                  onChange={(e) => set_remaining_draft(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="text-xs text-neutral-500">всего по акции</span>
                <input
                  type="number"
                  min={1}
                  value={limit_draft}
                  onChange={(e) => set_limit_draft(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm tabular-nums"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-pill bg-accent py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
            >
              {busy ? 'сохраняем…' : saved ? 'сохранено' : 'сохранить остаток'}
            </button>
          </form>

          <p className="mt-2 text-[11px] leading-snug text-neutral-400">
            выдачи с кассы продолжают уменьшать остаток сами
            {updated
              ? ` · правили ${updated}${data.manual_updated_by ? ` · ${data.manual_updated_by}` : ''}`
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
