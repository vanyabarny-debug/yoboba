'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { fetch_my_orders, fetch_order_by_id } from '@/lib/orders';
import { format_order_number } from '@/lib/order-number';
import {
  get_active_order_id,
  is_active_order_status,
  order_status_rank,
  order_status_ui,
  set_active_order_id,
  subscribe_active_order_id,
  track_step_ids,
} from '@/lib/active-order-store';
import {
  ensure_order_notify_permission,
  notify_order_status,
} from '@/lib/order-notify';
import { subscribe_to_push } from '@/components/pwa-register';
import { is_supabase_configured } from '@/lib/supabase/config';
import type { order } from '@/lib/types';

function pickup_label(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function staff_path(pathname: string) {
  return (
    pathname.startsWith('/seller') ||
    pathname.startsWith('/barista') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/squad')
  );
}

function ActiveOrderWidgetInner() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [order, set_order] = useState<order | null>(null);
  const [expanded, set_expanded] = useState(false);
  const [dismissed_id, set_dismissed_id] = useState<string | null>(null);
  const last_status = useRef<string | null>(null);
  const notify_primed = useRef(false);
  const loading_ref = useRef(false);

  const apply_order = useCallback((next: order | null) => {
    if (!next) {
      return;
    }

    if (!is_active_order_status(next.status)) {
      if (next.status === 'completed' || next.status === 'cancelled') {
        if (last_status.current && last_status.current !== next.status) {
          void notify_order_status(next);
        }
        set_active_order_id(null);
        set_order(null);
        last_status.current = null;
      }
      return;
    }

    set_active_order_id(next.id);
    set_order(next);

    if (last_status.current && last_status.current !== next.status) {
      void notify_order_status(next);
      set_dismissed_id((d) => (d === next.id ? null : d));
      set_expanded(next.status === 'ready');
    }
    last_status.current = next.status;
  }, []);

  const load = useCallback(async () => {
    if (loading_ref.current) return;
    loading_ref.current = true;
    try {
      const stored = get_active_order_id();
      if (stored) {
        const { data, error } = await fetch_order_by_id(stored);
        if (data) {
          apply_order(data);
          return;
        }
        if (error && /не найден|не авторизован/i.test(error.message)) {
          set_active_order_id(null);
          set_order(null);
        }
      }

      if (!is_supabase_configured()) return;

      const { data: orders } = await fetch_my_orders();
      const active = (orders || []).find((o) => is_active_order_status(o.status));
      if (active) {
        apply_order(active);
      } else if (!get_active_order_id()) {
        set_order(null);
      }
    } finally {
      loading_ref.current = false;
    }
  }, [apply_order]);

  useEffect(() => {
    void load();
    return subscribe_active_order_id(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (!order) return;
    const t = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(t);
  }, [order?.id, load]);

  useEffect(() => {
    if (!order || notify_primed.current) return;
    notify_primed.current = true;
    void (async () => {
      const ok = await ensure_order_notify_permission();
      if (ok && is_supabase_configured() && order.user_id) {
        try {
          await subscribe_to_push(order.user_id);
        } catch {
          /* ignore */
        }
      }
      await notify_order_status(order);
    })();
  }, [order]);

  // на странице своего заказа — только тонкий island сверху
  const on_track_page = Boolean(order && pathname === `/orders/${order.id}`);
  const dismissed = Boolean(order && dismissed_id === order.id);

  if (!order || staff_path(pathname) || dismissed) return null;

  const active = order_status_rank(order.status);
  const ui = order_status_ui[order.status];
  const num = format_order_number(order);
  const ready = order.status === 'ready';

  const island = (
    <button
      type="button"
      onClick={() => {
        if (on_track_page) {
          set_expanded((v) => !v);
          return;
        }
        if (expanded) {
          router.push(`/orders/${order.id}`);
          return;
        }
        set_expanded(true);
      }}
      className={`pointer-events-auto mx-auto flex max-w-[min(92vw,22rem)] items-center gap-2 rounded-full px-3.5 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.22)] transition active:scale-[0.98] ${
        ready ? 'bg-accent text-white' : 'bg-neutral-950 text-white'
      }`}
      aria-label={`заказ № ${num}, ${ui.short}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          ready ? 'bg-white animate-pulse' : 'bg-accent animate-pulse'
        }`}
      />
      <span className="min-w-0 truncate text-left text-[13px] font-bold tabular-nums">
        № {num}
        <span className="font-semibold text-white/70"> · {ui.short}</span>
      </span>
      <span className="shrink-0 text-[11px] font-medium text-white/55">
        {ready ? 'забрать' : pickup_label(order.pickup_time)}
      </span>
    </button>
  );

  const sheet =
    expanded && !on_track_page ? (
      <div
        className={`pointer-events-auto mx-auto mt-2 w-full max-w-[min(92vw,22rem)] overflow-hidden rounded-[1.35rem] shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${
          ready ? 'bg-accent text-white' : 'bg-neutral-950 text-white'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${ready ? 'text-white/70' : 'text-white/45'}`}>
              активный заказ
            </p>
            <p className="mt-1 font-heading text-2xl font-bold tabular-nums leading-none">
              № {num}
            </p>
            <p className={`mt-1.5 text-sm font-semibold ${ready ? 'text-white' : 'text-accent'}`}>
              {ui.title}
              <span className={`font-normal ${ready ? 'text-white/80' : 'text-white/55'}`}>
                {' '}
                · {ui.hint}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => set_expanded(false)}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              ready ? 'bg-white/20' : 'bg-white/10'
            }`}
            aria-label="свернуть"
          >
            свернуть
          </button>
        </div>

        <div className="px-4 pb-2">
          <ol className="flex items-center gap-1">
            {track_step_ids.map((step, i) => {
              const reached = active >= i;
              return (
                <li key={step} className="flex min-w-0 flex-1 items-center gap-1">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      reached ? (ready ? 'bg-white' : 'bg-accent') : 'bg-white/25'
                    } ${active === i && !ready ? 'animate-pulse' : ''}`}
                  />
                  {i < track_step_ids.length - 1 ? (
                    <span
                      className={`h-0.5 min-w-0 flex-1 rounded-full ${
                        active > i ? (ready ? 'bg-white' : 'bg-accent') : 'bg-white/15'
                      }`}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className={`mt-2 text-xs ${ready ? 'text-white/80' : 'text-white/50'}`}>
            {ready ? 'заберите на кассе' : `заберите в ${pickup_label(order.pickup_time)}`}
          </p>
        </div>

        <div className="m-3 mt-1 flex gap-2">
          <Link
            href={`/orders/${order.id}`}
            className={`flex-1 rounded-2xl py-3 text-center text-sm font-bold ${
              ready ? 'bg-white text-accent' : 'bg-white/12 text-white'
            }`}
          >
            открыть
          </Link>
          <button
            type="button"
            onClick={() => {
              set_dismissed_id(order.id);
              set_expanded(false);
            }}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              ready ? 'bg-white/20' : 'bg-white/10'
            }`}
          >
            скрыть
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center px-3 pt-[max(0.65rem,var(--safe-top))]">
      {island}
      {sheet}
    </div>
  );
}

export default function active_order_widget() {
  return (
    <Suspense fallback={null}>
      <ActiveOrderWidgetInner />
    </Suspense>
  );
}
