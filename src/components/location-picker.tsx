'use client';

import { useEffect, useState } from 'react';
import {
  demo_cities,
  detect_location,
  get_location,
  normalize_city,
  set_location,
  type user_location,
} from '@/lib/location';

type props = {
  on_confirm: (location: user_location) => void;
};

export default function location_picker({ on_confirm }: props) {
  const [city, set_city] = useState('');
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');
  const [detected, set_detected] = useState(false);

  useEffect(() => {
    const saved = get_location();
    if (saved) {
      set_city(saved.city);
      set_detected(true);
    }
  }, []);

  async function handle_detect() {
    set_loading(true);
    set_error('');
    try {
      const loc = await detect_location();
      set_city(loc.city);
      set_detected(true);
    } catch {
      set_error('не удалось определить — выберите город вручную');
    }
    set_loading(false);
  }

  function handle_confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) {
      set_error('выберите город');
      return;
    }
    const location: user_location = { city: normalize_city(city) };
    set_location(location);
    on_confirm(location);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">ваш город</p>
        <p className="text-xs text-neutral-500 mt-1">
          покажем меню и время выдачи для вашей локации
        </p>
      </div>

      {city && detected && (
        <div className="rounded-xl bg-cream px-4 py-3">
          <p className="text-xs text-neutral-500">определено</p>
          <p className="text-lg font-semibold capitalize">{city}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handle_detect}
        disabled={loading}
        className="w-full rounded-pill border border-surface bg-white py-3 text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'определяем...' : 'определить автоматически'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-neutral-400">или выберите</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {demo_cities.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              set_city(c);
              set_detected(false);
            }}
            className={`rounded-pill px-3 py-1.5 text-sm capitalize transition-colors ${
              city === c
                ? 'bg-accent text-accent-foreground'
                : 'bg-surface text-neutral-600 hover:bg-cream'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <form onSubmit={handle_confirm}>
        <label className="block mb-3">
          <span className="text-sm text-neutral-600">другой город</span>
          <input
            type="text"
            value={city}
            onChange={(e) => {
              set_city(e.target.value);
              set_detected(false);
            }}
            placeholder="введите название"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-highlight bg-cream/50 capitalize"
          />
        </label>
        <button
          type="submit"
          disabled={!city.trim()}
          className="w-full rounded-pill bg-accent text-accent-foreground py-3 font-medium disabled:opacity-50"
        >
          продолжить
        </button>
      </form>

      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}
