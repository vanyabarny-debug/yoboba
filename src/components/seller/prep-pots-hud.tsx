'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  pot_fill_ratio,
  prep_plan_for,
  prep_station_alert,
  type prep_alert_level,
  type prep_station_view,
} from '@/lib/finance/prep-stations';
import PrepVessel, { liquid_tone_for, PREP_VESSEL_CSS } from '@/components/seller/prep-vessel';
import prep_station_card from '@/components/seller/prep-station-card';
import { play_prep_low_chime } from '@/lib/order-chime';

const REMIND_MS = 90_000;

type props = {
  /** открытая станция снаружи (если карточки рендерятся в сетке доски) */
  open_id?: string | null;
  on_open_change?: (id: string | null) => void;
  /** отдать станции родителю для сетки «в работе» */
  on_stations?: (stations: prep_station_view[]) => void;
  /** если true — карточки рисует родитель, тут только лист варки */
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
  const [dry_g, set_dry_g] = useState('');
  const [marinade_count, set_marinade_count] = useState('0');

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

  // звук при «мало/пусто» + повторное напоминание, пока не сварят
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
    set_dry_g(String(active.defaultDryG || ''));
    set_marinade_count(active.marinade?.enabled ? '1' : '0');
    set_error('');
  }, [active?.id]);

  const plan = useMemo(() => {
    if (!active) return null;
    return prep_plan_for(active, Number(dry_g), Number(marinade_count));
  }, [active, dry_g, marinade_count]);
  const preview_cooked = plan?.cookedG ?? 0;
  const side_lines = (plan?.lines ?? []).filter((l) => l.part !== 'main');

  const preview_cups =
    active && preview_cooked > 0
      ? Math.floor(preview_cooked / Math.max(1, active.portionG))
      : 0;

  async function submit_cook() {
    if (!active || busy) return;
    set_busy(true);
    set_error('');
    try {
      const res = await fetch('/api/seller/prep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          kind: 'cook',
          stationId: active.id,
          dryG: Number(dry_g),
          marinadeCount: Number(marinade_count) || 0,
        }),
      });
      const body = (await res.json()) as { error?: string; stations?: prep_station_view[] };
      if (!res.ok) {
        set_error(body.error || 'не удалось сварить');
        return;
      }
      const next = body.stations ?? [];
      set_stations(next);
      on_stations_ref.current?.(next);
      set_open_id(null);
    } catch {
      set_error('сеть недоступна');
    } finally {
      set_busy(false);
    }
  }

  async function submit_discard() {
    if (!active || busy) return;
    if (!confirm(`списать весь остаток «${active.label}» (${format_g(active.cookedQty)})?`)) return;
    set_busy(true);
    set_error('');
    try {
      const res = await fetch('/api/seller/prep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ kind: 'discard', stationId: active.id }),
      });
      const body = (await res.json()) as { error?: string; stations?: prep_station_view[] };
      if (!res.ok) {
        set_error(body.error || 'не удалось списать');
        return;
      }
      const next = body.stations ?? [];
      set_stations(next);
      on_stations_ref.current?.(next);
      set_open_id(null);
    } catch {
      set_error('сеть недоступна');
    } finally {
      set_busy(false);
    }
  }

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
        <div className="fixed inset-0 z-[75] flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
            aria-label="закрыть"
            onClick={() => set_open_id(null)}
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.22)]">
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
                <p className="mt-0.5 text-xs text-neutral-600">
                  осталось {format_g(active.cookedQty)}
                  {active.batchFullG > 0
                    ? ` · из ${format_g(active.batchFullG)}`
                    : ''}{' '}
                  · ~{active.cupsLeft} ст
                </p>
                <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                  % от последней варки · норма {active.defaultDryG}→
                  {active.defaultCookedG} г
                </p>
                <p
                  className={`mt-0.5 text-[11px] ${active.dryQty < 0 ? 'font-semibold text-red-600' : 'text-neutral-500'}`}
                >
                  сухого на складе {format_g(active.dryQty)}
                  {active.dryQty < 0 ? ' — закроется следующим поступлением' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => set_open_id(null)}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">
                  положил сухого, г
                </span>
                <input
                  inputMode="numeric"
                  value={dry_g}
                  onChange={(e) => set_dry_g(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base tabular-nums outline-none focus:border-accent"
                  autoFocus
                />
              </label>
              {active.marinade?.enabled ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">
                    {active.marinade.label}, раз залил
                  </span>
                  <input
                    inputMode="numeric"
                    value={marinade_count}
                    onChange={(e) => set_marinade_count(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base tabular-nums outline-none focus:border-accent"
                  />
                </label>
              ) : null}
              {side_lines.length || (plan?.waterMl ?? 0) > 0 ? (
                <p className="text-[11px] leading-snug text-neutral-500">
                  {side_lines
                    .map((l) => {
                      const n = active.names[l.materialId];
                      return `${Math.round(l.qty * 10) / 10} ${n?.unit ?? 'г'} ${n?.name ?? l.materialId}`;
                    })
                    .concat((plan?.waterMl ?? 0) > 0 ? [`вода ${plan!.waterMl} мл`] : [])
                    .join(' · ')}
                </p>
              ) : null}
              <p className="text-center text-sm text-neutral-700">
                дольётся{' '}
                <span className="font-bold tabular-nums">
                  {preview_cooked > 0 ? format_g(preview_cooked) : '—'}
                </span>
                {preview_cups > 0 ? (
                  <span className="text-neutral-500"> · ~{preview_cups} ст</span>
                ) : null}
              </p>
              {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                disabled={busy || preview_cooked <= 0}
                onClick={() => void submit_cook()}
                className="w-full rounded-2xl bg-accent/95 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
              >
                {busy ? 'пишем…' : active.kind === 'pot' ? 'сварить' : 'заварить'}
              </button>
              <button
                type="button"
                disabled={busy || active.cookedQty <= 0}
                onClick={() => void submit_discard()}
                className="w-full rounded-2xl bg-neutral-100 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-40"
              >
                списать остаток
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
