'use client';

import { useEffect, useState } from 'react';
import {
  format_phone_display,
  format_phone_input,
  phone_input_to_e164,
} from '@/lib/phone';
import { format_price } from '@/lib/cart-summary';
import {
  confirm_gift_payment,
  create_gift_checkout,
  gift_items_label,
  type gift_actor,
} from '@/lib/gifts';
import type { gift, order_item } from '@/lib/types';

type step = 'form' | 'pay' | 'done';

type props = {
  open: boolean;
  items: order_item[];
  actor: gift_actor | null;
  on_close: () => void;
  on_done: (gift: gift) => void;
  on_need_login: () => void;
};

export default function gift_sheet({
  open,
  items,
  actor,
  on_close,
  on_done,
  on_need_login,
}: props) {
  const [draft, set_draft] = useState('');
  const [message, set_message] = useState('');
  const [step, set_step] = useState<step>('form');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const [gift, set_gift] = useState<gift | null>(null);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  useEffect(() => {
    if (!open) return;
    set_draft('');
    set_message('');
    set_step('form');
    set_busy(false);
    set_error('');
    set_gift(null);
  }, [open]);

  if (!open) return null;

  async function handle_create(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) {
      on_need_login();
      return;
    }
    const phone = phone_input_to_e164(draft);
    if (!phone) {
      set_error('введите номер получателя полностью — 10 цифр после +7');
      return;
    }
    if (actor.phone && actor.phone === phone) {
      set_error('нельзя подарить самому себе');
      return;
    }
    if (!items.length) {
      set_error('выберите напиток');
      return;
    }

    set_busy(true);
    set_error('');
    const { gift: created, error: err } = await create_gift_checkout({
      items,
      recipient_phone: phone,
      message,
      actor,
    });
    set_busy(false);
    if (err || !created) {
      set_error(err?.message || 'не удалось создать подарок');
      return;
    }

    set_gift(created);
    if (created.status === 'paid') {
      set_step('done');
      return;
    }
    if (created.checkout_url) {
      window.location.href = created.checkout_url;
      return;
    }
    set_step('pay');
  }

  async function handle_pay() {
    if (!gift || !actor) return;
    set_busy(true);
    set_error('');
    const { gift: paid, error: err } = await confirm_gift_payment(gift.id, actor);
    set_busy(false);
    if (err || !paid) {
      set_error(err?.message || 'не удалось оплатить');
      return;
    }
    set_gift(paid);
    set_step('done');
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45"
        onClick={on_close}
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft p-6 sm:p-8">
        {step === 'form' && (
          <form onSubmit={handle_create}>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
              подарить напиток
            </h2>
            <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
              оплатите онлайн — человеку с этим номером придёт подарок, и он
              заберёт его на точке.
            </p>

            <div className="mt-5 rounded-2xl bg-[#f6f6f8] px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">
                {gift_items_label(items) || 'напиток'}
              </p>
              <p className="mt-1 text-sm font-mono tabular-nums text-neutral-600">
                {format_price(total)} ₽
              </p>
            </div>

            <label className="mt-5 block">
              <span className="text-sm text-neutral-600">телефон получателя</span>
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

            <label className="mt-4 block">
              <span className="text-sm text-neutral-600">подпись на подарке</span>
              <input
                type="text"
                maxLength={140}
                value={message}
                onChange={(e) => set_message(e.target.value)}
                placeholder="необязательно"
                className="mt-1.5 w-full rounded-xl border border-neutral-200 bg-page px-3 py-2.5 text-sm font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-highlight"
              />
            </label>

            {error && <p className="mt-3 text-sm text-accent">{error}</p>}

            <div className="mt-6 space-y-3">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
              >
                {busy ? 'создаём…' : `к оплате · ${format_price(total)} ₽`}
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
        )}

        {step === 'pay' && gift && (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
              оплата онлайн
            </h2>
            <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
              настоящая касса подключится позже. сейчас это тестовая оплата — после
              неё подарок сразу уйдёт на{' '}
              <span className="font-medium text-neutral-800">
                {format_phone_display(gift.recipient_phone)}
              </span>
              .
            </p>
            <div className="mt-5 rounded-2xl bg-[#f6f6f8] px-4 py-3">
              <p className="text-sm font-semibold text-neutral-900">
                {gift_items_label(gift.items)}
              </p>
              <p className="mt-1 text-sm font-mono tabular-nums text-neutral-600">
                {format_price(gift.total_price)} ₽
              </p>
            </div>
            {error && <p className="mt-3 text-sm text-accent">{error}</p>}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handle_pay()}
                className="w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold disabled:opacity-60"
              >
                {busy ? 'оплачиваем…' : `оплатить ${format_price(gift.total_price)} ₽`}
              </button>
              <button
                type="button"
                onClick={on_close}
                className="w-full rounded-pill bg-surface text-neutral-800 py-3.5 text-sm font-medium"
              >
                позже
              </button>
            </div>
          </div>
        )}

        {step === 'done' && gift && (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
              подарок отправлен
            </h2>
            <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
              {gift_items_label(gift.items)} ждут{' '}
              {format_phone_display(gift.recipient_phone)}. забрать можно в течение
              14 дней — в приложении или на кассе по этому номеру.
            </p>
            <button
              type="button"
              onClick={() => on_done(gift)}
              className="mt-6 w-full rounded-pill bg-accent text-accent-foreground py-3.5 text-sm sm:text-base font-semibold"
            >
              готово
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
