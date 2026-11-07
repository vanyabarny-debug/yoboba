'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { store_spot } from '@/lib/types';
import {
  get_active_spots,
  spot_display,
  subscribe_spot_store,
} from '@/lib/spot-store';
import { useHydrated } from '@/lib/use-hydrated';

const storage_key = 'yoboba_admin_spot_id';

type admin_spot_ctx = {
  /** '' = все точки */
  spot_id: string;
  set_spot_id: (id: string) => void;
  spots: store_spot[];
  spot_options: { id: string; label: string }[];
  current_label: string;
};

const Ctx = createContext<admin_spot_ctx | null>(null);

export function AdminSpotProvider({ children }: { children: ReactNode }) {
  const [picked_spot_id, set_spot_id_raw] = useState('');
  const [spots_tick, set_spots_tick] = useState(0);

  const hydrated = useHydrated();
  const [restored, set_restored] = useState(false);
  if (hydrated && !restored) {
    set_restored(true);
    try {
      const saved = sessionStorage.getItem(storage_key);
      if (saved != null) set_spot_id_raw(saved);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => subscribe_spot_store(() => set_spots_tick((n) => n + 1)), []);

  const spots = useMemo(() => {
    void spots_tick;
    return get_active_spots();
  }, [spots_tick]);

  const set_spot_id = useCallback((id: string) => {
    set_spot_id_raw(id);
    try {
      sessionStorage.setItem(storage_key, id);
    } catch {
      /* ignore */
    }
  }, []);

  const spot_id = picked_spot_id && spots.some((s) => s.id === picked_spot_id) ? picked_spot_id : '';

  const spot_options = useMemo(
    () =>
      spots.map((s) => ({
        id: s.id,
        label: spot_display(s) || s.id,
      })),
    [spots]
  );

  // пустой spot_id = «все точки»; не подменяем на единственный адрес
  const current_label = spot_id
    ? spot_options.find((s) => s.id === spot_id)?.label || 'точка'
    : spots.length > 1
      ? 'все точки · среднее'
      : 'все точки';

  const value = useMemo(
    () => ({ spot_id, set_spot_id, spots, spot_options, current_label }),
    [spot_id, set_spot_id, spots, spot_options, current_label]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSpot() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useAdminSpot вне AdminSpotProvider');
  }
  return ctx;
}

/** для страниц вне провайдера — безопасный фолбэк */
export function useAdminSpotOptional(): admin_spot_ctx | null {
  return useContext(Ctx);
}
