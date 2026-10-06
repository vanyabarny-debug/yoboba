'use client';

import { useEffect, useMemo, useState } from 'react';
import type { cash_transaction, seller_shift_record, shift_open_geo } from '@/lib/types';
import { moscow_today_iso } from '@/lib/order-number';

function format_dt(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export default function shifts_manage() {
  const [shifts, set_shifts] = useState<seller_shift_record[]>([]);
  const [day, set_day] = useState(moscow_today_iso());
  const [spot_filter, set_spot_filter] = useState('');
  const [selected, set_selected] = useState<seller_shift_record | null>(null);
  const [txs, set_txs] = useState<cash_transaction[]>([]);
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    set_busy(true);
    const qs = new URLSearchParams({ shift_date: day });
    fetch(`/api/seller/shifts?${qs}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { shifts?: seller_shift_record[] }) => set_shifts(body.shifts || []))
      .catch(() => set_shifts([]))
      .finally(() => set_busy(false));
  }, [day]);

  useEffect(() => {
    if (!selected) {
      set_txs([]);
      return;
    }
    const qs = new URLSearchParams({
      shift_id: selected.id,
      shift_date: selected.shift_date,
      spot_id: selected.spot_id,
    });
    fetch(`/api/cash?${qs}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { transactions?: cash_transaction[] }) => set_txs(body.transactions || []))
      .catch(() => set_txs([]));
  }, [selected]);

  const spots = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shifts) {
      map.set(s.spot_id, `${s.spot_city}, ${s.spot_address}`);
    }
    return [...map.entries()];
  }, [shifts]);

  const filtered = spot_filter
    ? shifts.filter((s) => s.spot_id === spot_filter)
    : shifts;

  const selected_total = txs.reduce((s, t) => s + t.order_total, 0);
  const selected_maps = maps_url(selected?.open_geo);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">смены</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          касса, гео при открытии и операции по точкам
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
            смены {busy ? '…' : `(${filtered.length})`}
          </div>
          <ul className="divide-y divide-neutral-100 max-h-[28rem] overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-neutral-400">
                смен за этот день нет
              </li>
            ) : (
              filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => set_selected(s)}
                    className={`w-full px-4 py-3 text-left hover:bg-neutral-50 ${
                      selected?.id === s.id ? 'bg-neutral-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {s.seller_name}
                        </p>
                        <p className="text-xs text-neutral-500 truncate mt-0.5">
                          {s.spot_city}, {s.spot_address}
                        </p>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          {format_dt(s.opened_at)}
                          {s.closed_at ? ` → ${format_dt(s.closed_at)}` : ' · открыта'}
                        </p>
                        <p
                          className={`text-[11px] mt-1 truncate ${
                            s.open_geo?.status === 'ok'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {format_geo(s.open_geo)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          s.closed_at
                            ? 'bg-neutral-100 text-neutral-500'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {s.closed_at ? 'закрыта' : 'открыта'}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-sm font-semibold text-neutral-900">
              {selected ? `касса · ${selected.seller_name}` : 'касса смены'}
            </p>
            {selected ? (
              <>
                <p className="text-xs text-neutral-500 mt-0.5">
                  итого {selected_total} ₽ · {txs.length} оп.
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
              <p className="text-xs text-neutral-400 mt-0.5">выберите смену слева</p>
            )}
          </div>
          {!selected ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">нет выбора</p>
          ) : txs.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">
              операций в этой смене нет
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-[28rem] overflow-y-auto">
              {txs.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {t.items_summary || 'заказ'}
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {format_dt(t.created_at)} ·{' '}
                        {t.payment_method === 'cash' ? 'нал' : 'безнал'}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{t.order_total} ₽</p>
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
