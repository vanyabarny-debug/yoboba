'use client';

import { useState } from 'react';
import { format_phone_input, phone_input_to_e164 } from '@/lib/phone';

/** с карточки vk без номера подтянуть аккаунт, где был только телефон */
export default function LinkPhonePanel({
  customer,
  on_linked,
}: {
  customer: { id: string; phone: string | null };
  on_linked: (note: string) => void;
}) {
  const [open, set_open] = useState(false);
  const [draft, set_draft] = useState('');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');

  if (!/^[0-9a-f-]{36}$/i.test(customer.id) || customer.phone) return null;

  async function save() {
    const phone = phone_input_to_e164(draft);
    if (!phone) {
      set_error('введите номер полностью');
      return;
    }
    set_busy(true);
    set_error('');
    try {
      const res = await fetch('/api/admin/customers/link-phone', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: customer.id, phone }),
      });
      const body = (await res.json()) as { error?: string; linked_purchases?: boolean };
      if (!res.ok) {
        set_error(body.error || 'не удалось связать');
        return;
      }
      set_open(false);
      set_draft('');
      on_linked(
        body.linked_purchases
          ? 'номер привязан, прошлые покупки и бобаллы переехали сюда'
          : 'номер привязан'
      );
    } catch {
      set_error('не удалось связать');
    } finally {
      set_busy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => set_open(true)}
        className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
      >
        + связать с номером
      </button>
    );
  }

  return (
    <div data-stop-collapse className="space-y-2 rounded-xl border border-neutral-200 bg-white p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-800">аккаунт с телефоном</p>
        <button
          type="button"
          aria-label="закрыть"
          onClick={() => set_open(false)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="text-[11px] leading-snug text-neutral-500">
        номер с кассы или отдельного аккаунта. покупки и бобаллы переедут на эту карточку
      </p>
      <div className="flex items-center rounded-lg border border-neutral-200 px-2">
        <span className="pr-1 text-sm text-neutral-400">+7</span>
        <input
          type="tel"
          inputMode="numeric"
          value={draft}
          onChange={(e) => set_draft(format_phone_input(e.target.value))}
          placeholder="916 000-00-00"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
        />
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
      >
        {busy ? '…' : 'связать'}
      </button>
    </div>
  );
}
