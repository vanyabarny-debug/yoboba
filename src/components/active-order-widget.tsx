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

const POS_KEY = 'yoboba_order_widget_pos';

type pos = { x: number; y: number };

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

function read_pos(): pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as pos;
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return null;
}

function save_pos(p: pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function default_pos(): pos {
  if (typeof window === 'undefined') return { x: 16, y: 72 };
  return {
    x: Math.max(12, window.innerWidth / 2 - 110),
    y: Math.max(12, (window as Window & { visualViewport?: { offsetTop: number } }).visualViewport?.offsetTop ?? 0) + 56,
  };
}

function clamp_pos(p: pos, w: number, h: number): pos {
  const pad = 8;
  const max_x = Math.max(pad, window.innerWidth - w - pad);
  const max_y = Math.max(pad, window.innerHeight - h - pad);
  return {
    x: Math.min(max_x, Math.max(pad, p.x)),
    y: Math.min(max_y, Math.max(pad, p.y)),
  };
}

function ActiveOrderWidgetInner() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const root_ref = useRef<HTMLDivElement>(null);
  const drag_ref = useRef<{
    pointer_id: number;
    start_x: number;
    start_y: number;
    orig_x: number;
    orig_y: number;
    moved: boolean;
  } | null>(null);

  const [order, set_order] = useState<order | null>(null);
  const [expanded, set_expanded] = useState(false);
  const [dismissed_id, set_dismissed_id] = useState<string | null>(null);
  const [pos, set_pos] = useState<pos>(() => default_pos());
  const [dragging, set_dragging] = useState(false);
  const pos_ref = useRef(pos);
  const last_status = useRef<string | null>(null);
  const notify_primed = useRef(false);
  const loading_ref = useRef(false);

  useEffect(() => {
    pos_ref.current = pos;
  }, [pos]);

  useEffect(() => {
    const saved = read_pos();
    if (saved) set_pos(clamp_pos(saved, 220, 48));
  }, []);

  const apply_order = useCallback((next: order | null) => {
    if (!next) return;

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
      if (active) apply_order(active);
      else if (!get_active_order_id()) set_order(null);
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

  function on_pointer_down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = root_ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    drag_ref.current = {
      pointer_id: e.pointerId,
      start_x: e.clientX,
      start_y: e.clientY,
      orig_x: pos.x,
      orig_y: pos.y,
      moved: false,
    };
    set_dragging(true);
  }

  function on_pointer_move(e: React.PointerEvent) {
    const d = drag_ref.current;
    if (!d || d.pointer_id !== e.pointerId) return;
    const dx = e.clientX - d.start_x;
    const dy = e.clientY - d.start_y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const el = root_ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 48;
    const next = clamp_pos({ x: d.orig_x + dx, y: d.orig_y + dy }, w, h);
    pos_ref.current = next;
    set_pos(next);
  }

  function on_pointer_up(e: React.PointerEvent) {
    const d = drag_ref.current;
    if (!d || d.pointer_id !== e.pointerId) return;
    drag_ref.current = null;
    set_dragging(false);
    const el = root_ref.current;
    const next = clamp_pos(
      pos_ref.current,
      el?.offsetWidth ?? 220,
      el?.offsetHeight ?? 48
    );
    set_pos(next);
    save_pos(next);
    if (!d.moved && order) {
      if (expanded) {
        router.push(`/orders/${order.id}`);
      } else {
        set_expanded(true);
      }
    }
  }

  const dismissed = Boolean(order && dismissed_id === order.id);
  if (!order || staff_path(pathname) || dismissed) return null;

  const active = order_status_rank(order.status);
  const ui = order_status_ui[order.status];
  const num = format_order_number(order);
  const ready = order.status === 'ready';

  return (
    <div
      ref={root_ref}
      className={`fixed z-[60] touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: pos.x, top: pos.y, width: expanded ? 'min(92vw, 22rem)' : undefined }}
      onPointerDown={on_pointer_down}
      onPointerMove={on_pointer_move}
      onPointerUp={on_pointer_up}
      onPointerCancel={on_pointer_up}
    >
      <div
        className={`overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.22)] transition-[border-radius,box-shadow] ${
          expanded ? 'rounded-[1.35rem]' : 'rounded-full'
        } ${ready ? 'bg-accent text-white' : 'bg-neutral-950 text-white'}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              ready ? 'bg-white animate-pulse' : 'bg-accent animate-pulse'
            }`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-bold tabular-nums">
            № {num}
            <span className="font-semibold text-white/70"> · {ui.short}</span>
          </span>
          <span className="shrink-0 text-[11px] font-medium text-white/55">
            {ready ? 'забрать' : pickup_label(order.pickup_time)}
          </span>
          {expanded ? (
            <button
              type="button"
              className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold"
              onClick={(e) => {
                e.stopPropagation();
                set_expanded(false);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          ) : null}
        </div>

        {expanded ? (
          <div
            className="border-t border-white/10 px-4 pb-3 pt-2"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className={`text-sm font-semibold ${ready ? 'text-white' : 'text-accent'}`}>
              {ui.title}
              <span className={`font-normal ${ready ? 'text-white/80' : 'text-white/55'}`}>
                {' '}
                · {ui.hint}
              </span>
            </p>
            <ol className="mt-3 flex items-center gap-1">
              {track_step_ids.map((step, i) => {
                const reached = active >= i;
                return (
                  <li key={step} className="flex min-w-0 flex-1 items-center gap-1">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        reached ? (ready ? 'bg-white' : 'bg-accent') : 'bg-white/25'
                      }`}
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
            <div className="mt-3 flex gap-2">
              <Link
                href={`/orders/${order.id}`}
                className={`flex-1 rounded-2xl py-2.5 text-center text-sm font-bold ${
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
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold ${
                  ready ? 'bg-white/20' : 'bg-white/10'
                }`}
              >
                скрыть
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-white/40">потяните виджет, чтобы переместить</p>
          </div>
        ) : null}
      </div>
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
