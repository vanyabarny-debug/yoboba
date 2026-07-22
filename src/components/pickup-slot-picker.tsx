'use client';

import { useEffect, useState } from 'react';
import type { pickup_slot } from '@/lib/kitchen-queue';
import { SHEET_ANIM_MS, SHEET_OPEN_DELAY_MS } from '@/lib/drawer-ui';

type cart_line = { menu_id: string; name: string; quantity: number };

type props = {
  open: boolean;
  cart_lines: cart_line[];
  on_close: () => void;
  on_confirm: (pickup_at: string, label: string) => void;
};

export default function pickup_slot_picker({ open, cart_lines, on_close, on_confirm }: props) {
  const [slots, set_slots] = useState<pickup_slot[]>([]);
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [selected, set_selected] = useState<string | null>(null);
  const [sheet_visible, set_sheet_visible] = useState(false);
  const [sheet_open, set_sheet_open] = useState(false);

  useEffect(() => {
    if (!open) return;
    set_sheet_visible(true);
    set_sheet_open(false);
    const timer = window.setTimeout(() => set_sheet_open(true), SHEET_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open) return;
    set_sheet_open(false);
  }, [open]);

  useEffect(() => {
    if (open || !sheet_visible) return;
    const timer = window.setTimeout(() => set_sheet_visible(false), SHEET_ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [open, sheet_visible]);

  useEffect(() => {
    if (!open || cart_lines.length === 0) return;
    set_loading(true);
    set_error('');
    fetch('/api/kitchen/slots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cart_lines }),
    })
      .then((r) => r.json())
      .then((body: { slots?: pickup_slot[]; error?: string }) => {
        if (body.error) {
          set_error(body.error);
          return;
        }
        const next = body.slots ?? [];
        set_slots(next);
        set_selected(next[0]?.at ?? null);
      })
      .catch(() => set_error('не удалось рассчитать время'))
      .finally(() => set_loading(false));
  }, [open, cart_lines]);

  if (!sheet_visible && !open) return null;

  const picked = slots.find((s) => s.at === selected);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={on_close}
      />
      <div
        className={`relative w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl transition-transform duration-300 ${
          sheet_open ? 'translate-y-0' : 'translate-y-full sm:translate-y-4 sm:opacity-0'
        }`}
      >
        <div className="px-5 pt-5 pb-3 border-b border-neutral-100">
          <p className="text-lg font-bold text-neutral-900">когда забрать?</p>
          <p className="text-sm text-neutral-500 mt-1">
            время считается с учётом очереди бариста
          </p>
        </div>

        <div className="px-5 py-4 max-h-[50vh] overflow-y-auto">
          {loading && <p className="text-sm text-neutral-400">считаем слоты…</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && (
            <ul className="space-y-2">
              {slots.map((slot) => {
                const active = selected === slot.at;
                return (
                  <li key={slot.at}>
                    <button
                      type="button"
                      onClick={() => set_selected(slot.at)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-neutral-900">
                          {slot.is_asap ? 'как можно скорее' : slot.label}
                        </span>
                        <span className="text-sm font-mono tabular-nums text-neutral-500">
                          {slot.is_asap ? `~${slot.wait_minutes} мин` : slot.label}
                        </span>
                      </div>
                      {!slot.is_asap && (
                        <p className="text-xs text-neutral-400 mt-0.5">
                          через {slot.wait_minutes} мин
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-2">
          <button
            type="button"
            onClick={on_close}
            className="flex-1 rounded-2xl border border-neutral-200 py-3.5 text-sm font-medium text-neutral-600"
          >
            назад
          </button>
          <button
            type="button"
            disabled={!picked || loading}
            onClick={() => picked && on_confirm(picked.at, picked.label)}
            className="flex-[2] rounded-2xl bg-accent py-3.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            оформить
          </button>
        </div>
      </div>
    </div>
  );
}
