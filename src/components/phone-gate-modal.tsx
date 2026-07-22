'use client';

import { useEffect, useState } from 'react';
import { format_phone_input, phone_input_to_e164 } from '@/lib/phone';
import { update_profile } from '@/lib/auth';

type props = {
  open: boolean;
  on_close: () => void;
  on_saved: (phone: string) => void;
};

export default function phone_gate_modal({ open, on_close, on_saved }: props) {
  const [draft, set_draft] = useState('');
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState('');

  useEffect(() => {
    if (open) {
      set_draft('');
      set_error('');
      set_saving(false);
    }
  }, [open]);

  if (!open) return null;

  async function handle_submit(e: React.FormEvent) {
    e.preventDefault();
    const phone = phone_input_to_e164(draft);
    if (!phone) {
      set_error('введите номер полностью — 10 цифр после +7');
      return;
    }

    set_saving(true);
    set_error('');

    const { profile, error: err } = await update_profile({ phone });
    set_saving(false);

    if (err || !profile?.phone) {
      set_error(err?.message || 'не удалось сохранить номер');
      return;
    }

    on_saved(profile.phone);
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45"
        onClick={on_close}
      />

      <form
        onSubmit={handle_submit}
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft p-6 sm:p-8"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
          номер для заказа
        </h2>
        <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
          укажите телефон — позвоним, если что-то с заказом. сохраним в вашем аккаунте.
        </p>

        <label className="mt-5 block">
          <span className="text-sm text-neutral-600">телефон</span>
          <div className="mt-1.5 flex items-center rounded-xl border border-neutral-200 bg-page px-3 py-2.5 focus-within:ring-2 focus-within:ring-highlight">
            <span className="text-sm font-medium text-neutral-500 pr-2">+7</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={draft}
              onChange={(e) => set_draft(format_phone_input(e.target.value))}
              placeholder="916 000-00-00"
              className="flex-1 bg-transparent text-sm font-medium text-neutral-900 outline-none"
              autoFocus
              required
            />
          </div>
        </label>

        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        <div className="mt-6 space-y-3">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
          >
            {saving ? 'сохраняем…' : 'продолжить оформление'}
          </button>
          <button
            type="button"
            onClick={on_close}
            className="w-full rounded-pill bg-surface text-neutral-800 py-3.5 text-sm font-medium"
          >
            отмена
          </button>
        </div>
      </form>
    </div>
  );
}
