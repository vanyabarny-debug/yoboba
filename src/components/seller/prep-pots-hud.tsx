'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cooked_from_dry,
  cups_from_grams,
  cups_label,
  pot_fill_ratio,
  prep_station_alert,
  type prep_alert_level,
  type prep_station_view,
} from '@/lib/finance/prep-stations';
import PrepVessel, { liquid_tone_for, PREP_VESSEL_CSS } from '@/components/seller/prep-vessel';
import prep_station_card from '@/components/seller/prep-station-card';
import { FLOATING_CLOSE_BTN_CLASS } from '@/lib/drawer-ui';
import { play_prep_low_chime } from '@/lib/order-chime';

const REMIND_MS = 90_000;

type props = {
  open_id?: string | null;
  on_open_change?: (id: string | null) => void;
  on_stations?: (stations: prep_station_view[]) => void;
  cards_external?: boolean;
};

function format_g(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} кг`;
  return `${Math.round(n)} г`;
}

function fill_of(s: prep_station_view) {
  return pot_fill_ratio(s, s.cookedQty);
}

export default function prep_stations_board({
  open_id: open_id_controlled,
  on_open_change,
  on_stations,
  cards_external = false,
}: props) {
  const [stations, set_stations] = useState<prep_station_view[]>([]);
  const [open_local, set_open_local] = useState<string | null>(null);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const [notice, set_notice] = useState('');
  const [dry_g, set_dry_g] = useState('');
  const [still_g, set_still_g] = useState('');

  const open_id = open_id_controlled !== undefined ? open_id_controlled : open_local;
  const on_stations_ref = useRef(on_stations);
  on_stations_ref.current = on_stations;
  const alert_prev = useRef<Map<string, prep_alert_level>>(new Map());
  const last_remind_at = useRef(0);

  const set_open_id = useCallback(
    (id: string | null) => {
      on_open_change?.(id);
      if (open_id_controlled === undefined) set_open_local(id);
    },
    [on_open_change, open_id_controlled]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller/prep', { credentials: 'same-origin' });
      if (!res.ok) return;
      const body = (await res.json()) as { stations?: prep_station_view[] };
      const next = body.stations ?? [];
      set_stations(next);
      on_stations_ref.current?.(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    let should_chime = false;
    let any_alert = false;
    for (const s of stations) {
      const level = prep_station_alert(s);
      const prev = alert_prev.current.get(s.id) ?? 'ok';
      if (level !== 'ok') any_alert = true;
      if (prev === 'ok' && level !== 'ok') should_chime = true;
      if (prev === 'low' && level === 'empty') should_chime = true;
      alert_prev.current.set(s.id, level);
    }
    const now = Date.now();
    if (any_alert && now - last_remind_at.current >= REMIND_MS) {
      should_chime = true;
    }
    if (should_chime && any_alert) {
      play_prep_low_chime();
      last_remind_at.current = now;
    }
    if (!any_alert) last_remind_at.current = 0;
  }, [stations]);

  const active = stations.find((s) => s.id === open_id) ?? null;

  useEffect(() => {
    if (!active) return;
    set_dry_g('');
    set_still_g(String(Math.max(0, Math.round(active.cookedQty) || 0)));
    set_error('');
    set_notice('');
  }, [active?.id]);

  const preview_cooked = useMemo(() => {
    if (!active) return 0;
    return cooked_from_dry(active, Number(dry_g));
  }, [active, dry_g]);

  const preview_water = useMemo(() => {
    if (!active || active.kind !== 'teapot' || active.waterMl <= 0 || active.defaultDryG <= 0) {
      return 0;
    }
    const dry = Math.round(Number(dry_g) || 0);
    if (dry <= 0) return 0;
    return Math.max(1, Math.round((dry * active.waterMl) / active.defaultDryG));
  }, [active, dry_g]);

  const preview_cups = useMemo(() => {
    if (!active || preview_cooked <= 0) return '';
    const span = cups_from_grams(preview_cooked, {
      minG: active.portionMinG,
      maxG: active.portionMaxG,
      typicalG: active.portionTypicalG,
    });
    return cups_label(span.cupsMin, span.cupsMax);
  }, [active, preview_cooked]);

  function apply_stations(body: { stations?: prep_station_view[]; message?: string }, close = false) {
    const next = body.stations ?? [];
    set_stations(next);
    on_stations_ref.current?.(next);
    const fresh = next.find((s) => s.id === active?.id);
    if (fresh) {
      set_still_g(String(Math.max(0, Math.round(fresh.cookedQty) || 0)));
    }
    if (body.message) set_notice(body.message);
    if (close) set_open_id(null);
  }

  async function post(payload: Record<string, unknown>, fail: string, close = false) {
    if (!active || busy) return;
    set_busy(true);
    set_error('');
    set_notice('');
    try {
      const res = await fetch('/api/seller/prep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, stationId: active.id }),
      });
      const body = (await res.json()) as {
        error?: string;
        stations?: prep_station_view[];
        message?: string;
      };
      if (!res.ok) {
        set_error(body.error || fail);
        return;
      }
      apply_stations(body, close && !body.message);
    } catch {
      set_error('сеть недоступна');
    } finally {
      set_busy(false);
    }
  }

  const empty = !active || active.cookedQty <= 0;
  const still_ok = still_g.trim() !== '' && Number.isFinite(Number(still_g)) && Number(still_g) >= 0;
  const cook_label = active?.kind === 'pot' ? 'сварить' : 'заварить';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PREP_VESSEL_CSS }} />

      {!cards_external
        ? stations.map((s) =>
            createElement(prep_station_card, {
              key: s.id,
              station: s,
              on_open: () => set_open_id(s.id),
            })
          )
        : null}

      {active ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
            aria-label="закрыть"
            onClick={() => set_open_id(null)}
          />
          <div className="relative w-full max-w-sm">
            <button
              type="button"
              onClick={() => set_open_id(null)}
              className={FLOATING_CLOSE_BTN_CLASS}
              aria-label="закрыть"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.22)]">
              <div className="flex items-center gap-3 px-4 pt-4">
                <PrepVessel
                  kind={active.kind}
                  fill={fill_of(active)}
                  size="lg"
                  tone={liquid_tone_for(active.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold tracking-tight text-neutral-900">
                    {active.label}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-neutral-800">
                    {empty ? 'пусто' : format_g(active.cookedQty)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 px-4 py-4">
                {active.marinadePending ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void post({ kind: 'marinade' }, 'не удалось записать маринад')}
                    className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? '…' : 'залил маринад'}
                  </button>
                ) : null}

                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    value={still_g}
                    onChange={(e) => set_still_g(e.target.value)}
                    placeholder="г"
                    aria-label="факт, г"
                    className="w-28 shrink-0 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center text-base font-bold tabular-nums outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    disabled={busy || !still_ok}
                    onClick={() =>
                      void post(
                        { kind: 'still_have', cookedG: Number(still_g) },
                        'не удалось записать факт'
                      )
                    }
                    className="min-w-0 flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? '…' : 'факт'}
                  </button>
                </div>
                <p className="text-center text-[11px] text-neutral-400">
                  сколько реально в кастрюле сейчас — можно 0
                </p>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      inputMode="numeric"
                      value={dry_g}
                      onChange={(e) => set_dry_g(e.target.value)}
                      placeholder="сухой г"
                      aria-label="сухой, г"
                      className="w-28 shrink-0 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-center text-base font-bold tabular-nums outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      disabled={busy || preview_cooked <= 0}
                      onClick={() =>
                        void post({ kind: 'cook', dryG: Number(dry_g) }, 'не удалось сварить', true)
                      }
                      className="min-w-0 flex-1 rounded-2xl bg-accent/95 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
                    >
                      {busy
                        ? '…'
                        : preview_cooked > 0
                          ? `${cook_label} → ${format_g(preview_cooked)}`
                          : cook_label}
                    </button>
                  </div>
                  {active.kind === 'teapot' ? (
                    <p className="text-center text-sm tabular-nums text-neutral-600">
                      вода{' '}
                      <span className="font-semibold text-neutral-900">
                        {preview_water > 0 ? `${preview_water} мл` : '— мл'}
                      </span>
                      {preview_cups ? (
                        <span className="text-neutral-400"> · {preview_cups}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-center text-sm tabular-nums text-neutral-500">
                      {preview_cups || '≈— ст'}
                    </p>
                  )}
                </div>

                {!empty ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`списать ${format_g(active.cookedQty)}?`)) return;
                      void post({ kind: 'discard' }, 'не удалось списать', true);
                    }}
                    className="w-full rounded-2xl py-2.5 text-sm font-semibold text-red-600 disabled:opacity-40"
                  >
                    списать
                  </button>
                ) : null}

                {notice ? <p className="text-center text-sm text-emerald-700">{notice}</p> : null}
                {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
