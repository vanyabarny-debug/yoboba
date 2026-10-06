'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { menu_item } from '@/lib/types';
import {
  add_month,
  current_month_id,
  each_day,
  moscow_today,
  normalize_finance_state,
  type finance_state,
} from '@/lib/finance/model';

export type section_props = {
  state: finance_state;
  set_state: (fn: (prev: finance_state) => finance_state) => void;
  month: string;
  set_month: (m: string) => void;
  from: string;
  to: string;
  set_period: (from: string, to: string) => void;
  menu: menu_item[];
  set_menu?: (fn: (prev: menu_item[]) => menu_item[]) => void;
  compact?: boolean;
};

export type finance_bundle = {
  state: finance_state | null;
  set_state: (fn: (prev: finance_state) => finance_state) => void;
  month: string;
  set_month: (m: string) => void;
  from: string;
  to: string;
  set_period: (from: string, to: string) => void;
  menu: menu_item[];
  set_menu: (fn: (prev: menu_item[]) => menu_item[]) => void;
  error: string;
  save_status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  months: string[];
  loading: boolean;
};

export function use_finance(): finance_bundle {
  const [state, set_state_raw] = useState<finance_state | null>(null);
  const [menu, set_menu] = useState<menu_item[]>([]);
  const [month, set_month] = useState(current_month_id());
  const [from, set_from] = useState(() => `${moscow_today().slice(0, 8)}01`);
  const [to, set_to] = useState(() => moscow_today());
  const [error, set_error] = useState('');
  const [save_status, set_save_status] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const dirty_ref = useRef(false);
  const timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest_ref = useRef<finance_state | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/finance', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { state?: unknown; menu?: menu_item[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          set_error(body.error);
          return;
        }
        const today = moscow_today();
        const s0 = normalize_finance_state(body.state);
        const s = add_month(s0, today.slice(0, 7));
        latest_ref.current = s;
        set_state_raw(s);
        set_menu(body.menu ?? []);
      })
      .catch(() => set_error('не удалось загрузить финансы'));
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async () => {
    const s = latest_ref.current;
    if (!s || !dirty_ref.current) return;
    dirty_ref.current = false;
    set_save_status('saving');
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: s }),
      });
      if (!res.ok) throw new Error('save failed');
      set_save_status(dirty_ref.current ? 'dirty' : 'saved');
    } catch {
      dirty_ref.current = true;
      set_save_status('error');
    }
  }, []);

  const set_state = useCallback(
    (fn: (prev: finance_state) => finance_state) => {
      set_state_raw((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        latest_ref.current = next;
        return next;
      });
      dirty_ref.current = true;
      set_save_status('dirty');
      if (timer_ref.current) clearTimeout(timer_ref.current);
      timer_ref.current = setTimeout(() => void persist(), 900);
    },
    [persist]
  );

  useEffect(() => {
    const on_hide = () => {
      if (dirty_ref.current) void persist();
    };
    window.addEventListener('pagehide', on_hide);
    document.addEventListener('visibilitychange', on_hide);
    return () => {
      window.removeEventListener('pagehide', on_hide);
      document.removeEventListener('visibilitychange', on_hide);
    };
  }, [persist]);

  const set_period = useCallback((next_from: string, next_to: string) => {
    const a = next_from <= next_to ? next_from : next_to;
    const b = next_from <= next_to ? next_to : next_from;
    set_from(a);
    set_to(b);
    set_month(b.slice(0, 7));
    set_state_raw((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const d of each_day(a, b)) next = add_month(next, d.slice(0, 7));
      if (next !== prev) latest_ref.current = next;
      return next;
    });
  }, []);

  const months = useMemo(
    () => [...new Set((state?.monthsData ?? []).map((row) => row.month))].sort(),
    [state]
  );

  const set_menu_items = useCallback((fn: (prev: menu_item[]) => menu_item[]) => {
    set_menu(fn);
  }, []);

  return {
    state: state as finance_state | null,
    set_state,
    month,
    set_month,
    from,
    to,
    set_period,
    menu,
    set_menu: set_menu_items,
    error,
    save_status,
    months,
    loading: !error && !state,
  };
}

export function save_label(status: finance_bundle['save_status']) {
  if (status === 'saving') return 'сохраняю…';
  if (status === 'saved') return 'сохранено';
  if (status === 'dirty') return 'есть изменения';
  if (status === 'error') return 'ошибка сохранения';
  return '';
}
