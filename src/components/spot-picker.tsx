'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  get_location,
  normalize_city,
  set_location,
  type user_location,
} from '@/lib/location';
import { get_active_spots, subscribe_spot_store } from '@/lib/spot-store';
import type { store_spot } from '@/lib/types';

type props = {
  on_confirm: (location: user_location) => void;
};

export default function spot_picker({ on_confirm }: props) {
  const [spots, set_spots] = useState<store_spot[]>([]);
  const [selected_id, set_selected_id] = useState<string | null>(null);

  useEffect(() => {
    function reload() {
      const active = get_active_spots();
      set_spots(active);
      const saved = get_location();
      if (saved?.spot_id && active.some((s) => s.id === saved.spot_id)) {
        set_selected_id(saved.spot_id);
      } else if (saved?.city) {
        const in_city = active.find((s) => normalize_city(s.city) === normalize_city(saved.city));
        set_selected_id(in_city?.id ?? active[0]?.id ?? null);
      } else {
        set_selected_id(active[0]?.id ?? null);
      }
    }
    reload();
    return subscribe_spot_store(reload);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, store_spot[]>();
    for (const spot of spots) {
      const city = normalize_city(spot.city);
      const list = map.get(city) ?? [];
      list.push(spot);
      map.set(city, list);
    }
    return [...map.entries()];
  }, [spots]);

  function handle_select(spot: store_spot) {
    set_selected_id(spot.id);
    const location: user_location = {
      city: normalize_city(spot.city),
      spot_id: spot.id,
    };
    set_location(location);
    on_confirm(location);
  }

  if (!spots.length) {
    return (
      <p className="text-sm text-neutral-500 py-4">
        нет активных точек выдачи — добавьте их в админке
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map(([city, city_spots]) => (
        <div key={city}>
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 capitalize">
            {city}
          </p>
          <div className="space-y-2">
            {city_spots.map((spot) => (
              <button
                key={spot.id}
                type="button"
                onClick={() => handle_select(spot)}
                className={`w-full text-left rounded-xl px-4 py-3 border transition-colors ${
                  selected_id === spot.id
                    ? 'border-accent bg-cream'
                    : 'border-surface bg-white hover:bg-surface/50'
                }`}
              >
                <p className="font-semibold text-neutral-900 text-[15px] leading-snug">
                  {spot.address}
                </p>
                {spot.label && (
                  <p className="text-xs text-neutral-500 mt-1">{spot.label}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
