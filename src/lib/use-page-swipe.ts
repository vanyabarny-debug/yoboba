'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';

const AXIS_LOCK = 10;
const COMMIT_RATIO = 0.22;
const COMMIT_PX = 72;
const SNAP_MS = 320;

type options = {
  index: number;
  count: number;
  on_index: (next: number) => void;
  enabled?: boolean;
  /** свайп вправо на первой странице */
  on_edge_back?: () => void;
};

/**
 * Горизонтальное перелистывание: страница едет за пальцем и доезжает к соседней.
 */
export function use_page_swipe({
  index,
  count,
  on_index,
  enabled = true,
  on_edge_back,
}: options) {
  const [drag_x, set_drag_x] = useState(0);
  const [snapping, set_snapping] = useState(false);
  const [width, set_width] = useState(0);
  const [viewport, set_viewport] = useState<HTMLDivElement | null>(null);

  const start_ref = useRef<{ x: number; y: number } | null>(null);
  const mode_ref = useRef<'none' | 'h' | 'v'>('none');
  const drag_ref = useRef(0);
  const index_ref = useRef(index);
  const count_ref = useRef(count);
  const on_index_ref = useRef(on_index);
  const on_edge_back_ref = useRef(on_edge_back);
  const width_ref = useRef(0);
  const snapping_ref = useRef(false);
  const enabled_ref = useRef(enabled);

  index_ref.current = index;
  count_ref.current = count;
  on_index_ref.current = on_index;
  on_edge_back_ref.current = on_edge_back;
  enabled_ref.current = enabled;

  const measure = useCallback(() => {
    const w = viewport?.clientWidth ?? 0;
    width_ref.current = w;
    set_width(w);
  }, [viewport]);

  useEffect(() => {
    measure();
    if (!viewport) return;
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [measure, viewport]);

  useEffect(() => {
    drag_ref.current = 0;
    set_drag_x(0);
    set_snapping(false);
    snapping_ref.current = false;
  }, [index]);

  const clamp_drag = useCallback((dx: number) => {
    const i = index_ref.current;
    const n = count_ref.current;
    const can_back = Boolean(on_edge_back_ref.current);
    // только «назад» (одна страница) — можно тянуть в обе стороны
    if (can_back && n <= 1) return dx;
    if (i <= 0 && dx > 0 && !can_back) return dx * 0.35;
    if (i >= n - 1 && dx < 0) return dx * 0.35;
    return dx;
  }, []);

  const finish = useCallback((target_index: number, from_x: number, edge_back = false) => {
    const w = width_ref.current || 1;
    let to_x = 0;
    if (edge_back) to_x = from_x >= 0 ? w : -w;
    else if (target_index !== index_ref.current) {
      to_x = -(target_index - index_ref.current) * w;
    }

    snapping_ref.current = true;
    set_snapping(true);
    drag_ref.current = from_x;
    set_drag_x(from_x);

    requestAnimationFrame(() => {
      drag_ref.current = to_x;
      set_drag_x(to_x);
    });

    window.setTimeout(() => {
      if (edge_back) {
        on_edge_back_ref.current?.();
      } else if (target_index !== index_ref.current) {
        on_index_ref.current(target_index);
      }
      drag_ref.current = 0;
      set_drag_x(0);
      snapping_ref.current = false;
      set_snapping(false);
      start_ref.current = null;
      mode_ref.current = 'none';
    }, SNAP_MS);
  }, []);

  useEffect(() => {
    if (!viewport || !enabled) return;

    const on_start = (e: TouchEvent) => {
      if (!enabled_ref.current || snapping_ref.current || count_ref.current < 1) return;
      const t = e.touches[0];
      if (!t) return;
      start_ref.current = { x: t.clientX, y: t.clientY };
      mode_ref.current = 'none';
      drag_ref.current = 0;
      set_drag_x(0);
      set_snapping(false);
    };

    const on_move = (e: TouchEvent) => {
      if (!enabled_ref.current || snapping_ref.current || !start_ref.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start_ref.current.x;
      const dy = t.clientY - start_ref.current.y;

      if (mode_ref.current === 'none') {
        if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
        mode_ref.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (mode_ref.current !== 'h') return;

      e.preventDefault();
      const next = clamp_drag(dx);
      drag_ref.current = next;
      set_drag_x(next);
    };

    const on_end = () => {
      if (!enabled_ref.current || snapping_ref.current || !start_ref.current) {
        start_ref.current = null;
        mode_ref.current = 'none';
        return;
      }
      if (mode_ref.current !== 'h') {
        start_ref.current = null;
        mode_ref.current = 'none';
        drag_ref.current = 0;
        set_drag_x(0);
        return;
      }

      const dx = drag_ref.current;
      const w = width_ref.current || 1;
      const i = index_ref.current;
      const n = count_ref.current;
      const passed = Math.abs(dx) > Math.max(COMMIT_PX, w * COMMIT_RATIO);

      // одна страница + on_edge_back: любой горизонтальный свайп = назад
      if (passed && on_edge_back_ref.current && n <= 1) {
        finish(i, dx, true);
        return;
      }

      if (passed && dx > 0 && i <= 0 && on_edge_back_ref.current) {
        finish(i, dx, true);
        return;
      }

      let next = i;
      if (passed && dx < 0 && i < n - 1) next = i + 1;
      if (passed && dx > 0 && i > 0) next = i - 1;
      finish(next, dx);
    };

    viewport.addEventListener('touchstart', on_start, { passive: true });
    viewport.addEventListener('touchmove', on_move, { passive: false });
    viewport.addEventListener('touchend', on_end);
    viewport.addEventListener('touchcancel', on_end);
    return () => {
      viewport.removeEventListener('touchstart', on_start);
      viewport.removeEventListener('touchmove', on_move);
      viewport.removeEventListener('touchend', on_end);
      viewport.removeEventListener('touchcancel', on_end);
    };
  }, [viewport, enabled, clamp_drag, finish]);

  const page_style = useCallback(
    (page_index: number): CSSProperties => {
      const w = width || width_ref.current;
      const base = (page_index - index) * (w || 0);
      return {
        position: 'absolute',
        inset: 0,
        transform: `translate3d(${base + drag_x}px, 0, 0)`,
        transition: snapping ? `transform ${SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        willChange: 'transform',
        pointerEvents: page_index === index && !snapping ? 'auto' : 'none',
      };
    },
    [drag_x, index, snapping, width]
  );

  return {
    viewport_ref: set_viewport as Ref<HTMLDivElement>,
    page_style,
    dragging: Math.abs(drag_x) > 1 || snapping,
  };
}
