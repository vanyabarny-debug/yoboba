'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function active_order_widget() {
  const pathname = usePathname() || '/';
  const [order, set_order] = useState<order | null>(null);
  const [minimized, set_minimized] = useState(false);
  const [hidden, set_hidden] = useState(false);
  const last_status = useRef<string | null>(null);
  const notify_primed = useRef(false);

  const apply_order = useCallback(async (next: order | null) => {
    if (!next || !is_active_order_status(next.status)) {
      if (next && (next.status === 'completed' || next.status === 'cancelled')) {
        if (last_status.current && last_status.current !== next.status) {
          await notify_order_status(next);
        }
        set_active_order_id(null);
      }
      set_order(null);
      last_status.current = null;
      return;
    }

    set_active_order_id(next.id);
    set_order(next);
    set_hidden(false);

    if (last_status.current && last_status.current !== next.status) {
      await notify_order_status(next);
    }
    last_status.current = next.status;
  }, []);

  const load = useCallback(async () => {
    const stored = get_active_order_id();
    if (stored) {
      const { data } = await fetch_order_by_id(stored);
      if (data) {
        await apply_order(data);
        return;
      }
      set_active_order_id(null);
    }

    if (!is_supabase_configured()) return;

    const { data: orders } = await fetch_my_orders();
    const active = (orders || []).find((o) => is_active_order_status(o.status));
    await apply_order(active || null);
  }, [apply_order]);

  useEffect(() => {
    void load();
    return subscribe_active_order_id(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (!order) return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [order?.id, order?.status, load]);

  useEffect(() => {
    if (!order || notify_primed.current) return;
    notify_primed.current = true;
    void (async () => {
      const ok = await ensure_order_notify_permission();
      if (ok && is_supabase_configured()) {
        try {
          await subscribe_to_push(order.user_id);
        } catch {
          /* ignore */
        }
      }
      await notify_order_status(order);
    })();
  }, [order]);

  if (hidden || !order || staff_path(pathname)) return null;
  if (pathname === `/orders/${order.id}`) return null;

  const active = order_status_rank(order.status);
  const ui = order_status_ui[order.status];
  const num = format_order_number(order);
  const ready = order.status === 'ready';

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => set_minimized(false)}
        className={`fixed z-[55] left-4 right-4 min-[1024px]:left-auto min-[1024px]:right-6 min-[1024px]:w-auto mobile-order-widget flex items-center gap-2 rounded-full px-3.5 py-2.5 text-left shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition ${
          ready
            ? 'bg-accent text-accent-foreground'
            : 'bg-neutral-900 text-white'
        }`}
        aria-label={`заказ № ${num}, ${ui.short}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-base">
          🧋
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold tabular-nums">
            № {num} · {ui.short}
          </span>
          <span className="block truncate text-[11px] opacity-75">
            {ready ? 'можно забирать' : `к ${pickup_label(order.pickup_time)}`}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-[55] left-4 right-4 min-[1024px]:left-auto min-[1024px]:right-6 min-[1024px]:w-[22rem] mobile-order-widget overflow-hidden rounded-[1.35rem] shadow-[0_12px_40px_rgba(0,0,0,0.2)] ${
        ready ? 'bg-accent text-accent-foreground' : 'bg-neutral-900 text-white'
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => set_minimized(true)}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              ready ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/15'
            }`}
            aria-label="свернуть"
          >
            свернуть
          </button>
          <button
            type="button"
            onClick={() => set_hidden(true)}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
              ready ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/15'
            }`}
            aria-label="скрыть"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-4 pb-2">
        <ol className="flex items-center gap-1">
          {track_step_ids.map((step, i) => {
            const reached = active >= i;
            return (
              <li key={step} className="flex min-w-0 flex-1 items-center gap-1">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    reached
                      ? ready
                        ? 'bg-white'
                        : 'bg-accent'
                      : ready
                        ? 'bg-white/35'
                        : 'bg-white/25'
                  } ${active === i && !ready ? 'animate-pulse ring-4 ring-accent/30' : ''}`}
                />
                {i < track_step_ids.length - 1 ? (
                  <span
                    className={`h-0.5 min-w-0 flex-1 rounded-full ${
                      active > i
                        ? ready
                          ? 'bg-white'
                          : 'bg-accent'
                        : ready
                          ? 'bg-white/25'
                          : 'bg-white/15'
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

      <Link
        href={`/orders/${order.id}`}
        className={`m-3 mt-1 flex items-center justify-center rounded-2xl py-3 text-sm font-bold transition ${
          ready
            ? 'bg-white text-accent hover:bg-white/95'
            : 'bg-white/12 text-white hover:bg-white/18'
        }`}
      >
        следить за заказом
      </Link>
    </div>
  );
}
