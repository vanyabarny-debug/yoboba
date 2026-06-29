'use client';

import { createElement, useEffect, useState } from 'react';
import location_picker from '@/components/location-picker';
import { is_city_served, store_cities, type user_location } from '@/lib/location';

type gate_step = 'confirm' | 'prompt' | 'location' | 'pickup';

type props = {
  open: boolean;
  store_city: string;
  saved_location: user_location | null;
  on_close: () => void;
  on_location_confirmed: (loc: user_location) => void;
  on_login: () => void;
};

export default function order_gate_modal({
  open,
  store_city,
  saved_location,
  on_close,
  on_location_confirmed,
  on_login,
}: props) {
  const has_saved_city = Boolean(saved_location && is_city_served(saved_location.city));
  const [step, set_step] = useState<gate_step>('prompt');
  const [error, set_error] = useState('');

  useEffect(() => {
    if (open) {
      set_step(has_saved_city ? 'confirm' : 'prompt');
      set_error('');
    }
  }, [open, has_saved_city]);

  if (!open) return null;

  function reset() {
    set_step('prompt');
    set_error('');
  }

  function handle_close() {
    reset();
    on_close();
  }

  function confirm_location(loc: user_location) {
    if (!is_city_served(loc.city)) {
      set_error(`в городе «${loc.city}» пока нет yoboba — выберите другой или войдите в аккаунт`);
      return;
    }
    reset();
    on_location_confirmed(loc);
  }

  function handle_pickup_city(city: string) {
    confirm_location({ city });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/45"
        onClick={handle_close}
      />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-soft max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={handle_close}
          aria-label="закрыть"
          className="absolute right-4 top-4 z-10 text-neutral-400 text-2xl leading-none px-1 hover:text-neutral-600"
        >
          ×
        </button>

        {step === 'confirm' && saved_location && (
          <div className="p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
              проверьте адрес
            </h2>
            <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
              заберёте заказ в точке yoboba в городе{' '}
              <span className="font-medium text-neutral-700 capitalize">{saved_location.city}</span>?
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => confirm_location(saved_location)}
                className="w-full rounded-pill bg-accent text-white py-3.5 text-sm sm:text-base font-semibold hover:opacity-95 transition-opacity"
              >
                да, всё верно
              </button>
              <button
                type="button"
                onClick={() => {
                  set_error('');
                  set_step('prompt');
                }}
                className="w-full rounded-pill bg-surface text-neutral-800 py-3.5 text-sm sm:text-base font-medium hover:bg-neutral-200/70 transition-colors"
              >
                изменить город
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-neutral-500">
              уже есть аккаунт?{' '}
              <button
                type="button"
                onClick={on_login}
                className="font-semibold text-accent hover:underline"
              >
                войти
              </button>
            </p>

            {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          </div>
        )}

        {step === 'prompt' && (
          <div className="p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 pr-8">
              какой у вас город?
            </h2>
            <p className="mt-3 text-sm sm:text-[15px] leading-relaxed text-neutral-500">
              хотим убедиться, что вы рядом с точкой выдачи в{' '}
              <span className="font-medium text-neutral-700 capitalize">{store_city}</span>.
              город сохраним для будущих заказов.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => {
                  set_error('');
                  set_step('location');
                }}
                className="w-full rounded-pill bg-accent text-white py-3.5 text-sm sm:text-base font-semibold hover:opacity-95 transition-opacity"
              >
                указать свой город
              </button>
              <button
                type="button"
                onClick={() => {
                  set_error('');
                  set_step('pickup');
                }}
                className="w-full rounded-pill bg-surface text-neutral-800 py-3.5 text-sm sm:text-base font-medium hover:bg-neutral-200/70 transition-colors"
              >
                заберу в точке yoboba
              </button>
            </div>

            <p className="mt-6 text-center text-sm text-neutral-500">
              уже есть аккаунт?{' '}
              <button
                type="button"
                onClick={on_login}
                className="font-semibold text-accent hover:underline"
              >
                войти
              </button>
            </p>

            {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          </div>
        )}

        {step === 'location' && (
          <div className="p-6 sm:p-8">
            <button
              type="button"
              onClick={() => {
                set_error('');
                set_step('prompt');
              }}
              className="mb-4 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              ← назад
            </button>
            <h2 className="text-xl font-bold text-neutral-900">ваш город</h2>
            <p className="mt-2 text-sm text-neutral-500">
              определим автоматически или выберите вручную — так мы поймём, сможете ли забрать заказ
            </p>
            <div className="mt-5">
              {createElement(location_picker, {
                on_confirm: confirm_location,
              })}
            </div>
            {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          </div>
        )}

        {step === 'pickup' && (
          <div className="p-6 sm:p-8">
            <button
              type="button"
              onClick={() => {
                set_error('');
                set_step('prompt');
              }}
              className="mb-4 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              ← назад
            </button>
            <h2 className="text-xl font-bold text-neutral-900">где заберёте заказ?</h2>
            <p className="mt-2 text-sm text-neutral-500">
              выберите город, в котором сможете забрать напиток в точке yoboba
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {store_cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => handle_pickup_city(city)}
                  className={`rounded-pill px-4 py-2 text-sm capitalize transition-colors ${
                    normalize_pickup_active(city, store_city)
                      ? 'bg-accent text-white'
                      : 'bg-surface text-neutral-700 hover:bg-cream'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
            {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function normalize_pickup_active(city: string, store_city: string) {
  return city.toLowerCase() === store_city.toLowerCase();
}
