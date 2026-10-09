'use client';

import { useEffect, useMemo, useState } from 'react';
import type { cash_transaction, seller_shift_record, shift_open_geo } from '@/lib/types';
import { moscow_today_iso } from '@/lib/order-number';
import { shift_crew_names } from '@/lib/shift-crew';

function format_dt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function format_money(n: number) {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function spot_title(s: seller_shift_record) {
  const address = s.spot_address?.trim();
  const city = s.spot_city?.trim();
  if (address && city) return `${address}`;
  return address || city || s.spot_id;
}

function format_geo(geo: shift_open_geo | null | undefined) {
  if (!geo) return 'гео не записано';
  if (geo.status === 'ok' && geo.lat != null && geo.lng != null) {
    const acc =
      geo.accuracy != null && Number.isFinite(geo.accuracy)
        ? ` · ±${Math.round(geo.accuracy)} м`
        : '';
    const label = geo.label ? geo.label : `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`;
    return `${label}${acc}`;
  }
  if (geo.status === 'denied') return 'гео отказано на устройстве';
  if (geo.status === 'timeout') return 'гео не успело определиться';
  if (geo.status === 'unavailable') return 'гео недоступно';
  return 'гео ошибка';
}

function maps_url(geo: shift_open_geo | null | undefined) {
  if (!geo || geo.status !== 'ok' || geo.lat == null || geo.lng == null) return null;
  return `https://www.google.com/maps?q=${geo.lat},${geo.lng}`;
}

function crew_from_shift_and_txs(
  shift: seller_shift_record,
  txs: cash_transaction[]
): string[] {
  const names = shift_crew_names(shift);
  const seen = new Set(
    (shift.crew || []).map((m) => m.seller_id).concat(shift.seller_id ? [shift.seller_id] : [])
  );
  for (const t of txs) {
    if (!t.seller_id || seen.has(t.seller_id)) continue;
    seen.add(t.seller_id);
    names.push(t.seller_name || 'бариста');
  }
  return names;
}

export default function shifts_manage({ embedded = false }: { embedded?: boolean } = {}) {
  const [shifts, set_shifts] = useState<seller_shift_record[]>([]);
  const [day_txs, set_day_txs] = useState<cash_transaction[]>([]);
  const [day, set_day] = useState(moscow_today_iso());
  const [spot_filter, set_spot_filter] = useState('');
  const [selected, set_selected] = useState<seller_shift_record | null>(null);
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    set_busy(true);
    const qs = new URLSearchParams({ shift_date: day });
    Promise.all([
      fetch(`/api/seller/shifts?${qs}`, { credentials: 'same-origin' }).then((r) => r.json()),
      fetch(`/api/cash?${qs}`, { credentials: 'same-origin' }).then((r) => r.json()),
    ])
      .then(
        ([shifts_body, cash_body]: [
          { shifts?: seller_shift_record[] },
          { transactions?: cash_transaction[] },
        ]) => {
          set_shifts(shifts_body.shifts || []);
          set_day_txs(cash_body.transactions || []);
        }
      )
      .catch(() => {
        set_shifts([]);
        set_day_txs([]);
      })
      .finally(() => set_busy(false));
  }, [day]);

  const spots = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shifts) {
      map.set(s.spot_id, spot_title(s) + (s.spot_city ? ` · ${s.spot_city}` : ''));
    }
    return [...map.entries()];
  }, [shifts]);

  const filtered = spot_filter
    ? shifts.filter((s) => s.spot_id === spot_filter)
    : shifts;

  const txs_for_shift = useMemo(() => {
    const map = new Map<string, cash_transaction[]>();
    for (const s of shifts) {
      const list = day_txs.filter((t) => {
        if (t.shift_id && t.shift_id === s.id) return true;
        if (!t.shift_id && t.shift_date === s.shift_date && t.spot_id === s.spot_id) return true;
        if (t.shift_date === s.shift_date && t.spot_id === s.spot_id) return true;
        return false;
      });
      // unique by id
      const seen = new Set<string>();
      map.set(
        s.id,
        list.filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        })
      );
    }
    return map;
  }, [shifts, day_txs]);

  const selected_txs = selected ? txs_for_shift.get(selected.id) || [] : [];
  const selected_total = selected_txs.reduce((sum, t) => sum + t.order_total, 0);
  const selected_crew = selected ? crew_from_shift_and_txs(selected, selected_txs) : [];
  const selected_maps = maps_url(selected?.open_geo);

  const day_total = filtered.reduce((sum, s) => {
    const txs = txs_for_shift.get(s.id) || [];
    return sum + txs.reduce((a, t) => a + t.order_total, 0);
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {embedded ? (
            <>
              <h2 className="text-lg font-semibold text-neutral-900">смены</h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                кто на точке, когда открыли и сколько пробили за день
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-neutral-900">смены</h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                точка · состав · выручка за день
              </p>
            </>
          )}
        </div>
        <p className="text-sm font-semibold tabular-nums text-neutral-900">
          итого {busy ? '…' : format_money(day_total)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-600">
          день
          <input
            type="date"
            value={day}
            onChange={(e) => {
              set_day(e.target.value);
              set_selected(null);
            }}
            className="ml-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm text-neutral-600">
          точка
          <select
            value={spot_filter}
            onChange={(e) => set_spot_filter(e.target.value)}
            className="ml-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
          >
            <option value="">все</option>
            {spots.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 text-sm font-semibold">
            точки {busy ? '…' : `(${filtered.length})`}
          </div>
          <ul className="divide-y divide-neutral-100 max-h-[28rem] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-neutral-400">
                смен за этот день нет
              </li>
            ) : (
              filtered.map((s) => {
                const txs = txs_for_shift.get(s.id) || [];
                const revenue = txs.reduce((a, t) => a + t.order_total, 0);
                const crew = crew_from_shift_and_txs(s, txs);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => set_selected(s)}
                      className={`w-full px-4 py-3 text-left hover:bg-neutral-50 ${
                        selected?.id === s.id ? 'bg-neutral-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {spot_title(s)}
                          </p>
                          {s.spot_city ? (
                            <p className="text-xs text-neutral-500 truncate mt-0.5 capitalize">
                              {s.spot_city}
                            </p>
                          ) : null}
                          <p className="text-xs text-neutral-700 mt-1.5 leading-snug">
                            {crew.length > 0 ? crew.join(', ') : 'бариста не отмечены'}
                          </p>
                          <p className="text-[11px] text-neutral-400 mt-1">
                            {format_dt(s.opened_at)}
                            {s.closed_at ? ` → ${format_dt(s.closed_at)}` : ' · открыта'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-neutral-900">
                            {format_money(revenue)}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              s.closed_at
                                ? 'bg-neutral-100 text-neutral-500'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {s.closed_at ? 'закрыта' : 'открыта'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            {selected ? (
              <>
                <p className="text-sm font-semibold text-neutral-900">{spot_title(selected)}</p>
                {selected.spot_city ? (
                  <p className="text-xs text-neutral-500 mt-0.5 capitalize">{selected.spot_city}</p>
                ) : null}
                <p className="text-xs text-neutral-700 mt-2">
                  <span className="text-neutral-400">бариста: </span>
                  {selected_crew.length > 0 ? selected_crew.join(', ') : '—'}
                </p>
                <p className="text-sm font-bold tabular-nums text-neutral-900 mt-2">
                  {format_money(selected_total)}
                  <span className="ml-1.5 text-xs font-normal text-neutral-400">
                    · {selected_txs.length} оп.
                  </span>
                </p>
                <p className="text-xs text-neutral-600 mt-1.5">
                  гео открытия: {format_geo(selected.open_geo)}
                </p>
                {selected_maps ? (
                  <a
                    href={selected_maps}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-xs text-accent mt-1 hover:underline"
                  >
                    открыть на карте
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-neutral-900">касса смены</p>
                <p className="text-xs text-neutral-400 mt-0.5">выберите точку слева</p>
              </>
            )}
          </div>
          {!selected ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">нет выбора</p>
          ) : selected_txs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">
              операций в этой смене нет
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-[28rem] overflow-y-auto">
              {selected_txs.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {t.items_summary || 'заказ'}
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {format_dt(t.created_at)} · {t.seller_name || 'бариста'} ·{' '}
                        {t.payment_method === 'cash' ? 'нал' : 'безнал'}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums">
                      {format_money(t.order_total)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
