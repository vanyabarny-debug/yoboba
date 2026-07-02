'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';

const DISMISS_THRESHOLD = 88;
const BACK_THRESHOLD = 64;
const AXIS_LOCK_PX = 8;
const SNAP_MS = 280;

type sheet_swipe_options = {
  active: boolean;
  on_dismiss: () => void;
  on_back?: () => void;
  can_back?: boolean;
  get_scroll_top?: () => number;
};

export function use_sheet_swipe({
  active,
  on_dismiss,
  on_back,
  can_back = false,
  get_scroll_top,
}: sheet_swipe_options) {
  const [mobile, set_mobile] = useState(false);
  const [offset, set_offset] = useState({ x: 0, y: 0 });
  const [snapping, set_snapping] = useState(false);

  const sheet_ref = useRef<HTMLDivElement | null>(null);
  const start_ref = useRef<{ x: number; y: number } | null>(null);
  const mode_ref = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const offset_ref = useRef({ x: 0, y: 0 });
  const can_back_ref = useRef(can_back);
  const on_back_ref = useRef(on_back);
  const on_dismiss_ref = useRef(on_dismiss);
  const get_scroll_top_ref = useRef(get_scroll_top);

  can_back_ref.current = can_back;
  on_back_ref.current = on_back;
  on_dismiss_ref.current = on_dismiss;
  get_scroll_top_ref.current = get_scroll_top;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => set_mobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const write_offset = useCallback((next: { x: number; y: number }) => {
    offset_ref.current = next;
    set_offset(next);
  }, []);

  const clear_gesture = useCallback(() => {
    start_ref.current = null;
    mode_ref.current = 'none';
    set_snapping(false);
    write_offset({ x: 0, y: 0 });
  }, [write_offset]);

  useEffect(() => {
    if (active) clear_gesture();
  }, [active, clear_gesture]);

  const on_touch_start_native = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!mobile || !active || snapping) return;
      const touch = e.touches[0];
      if (!touch) return;
      start_ref.current = { x: touch.clientX, y: touch.clientY };
      mode_ref.current = 'none';
    },
    [mobile, active, snapping]
  );

  const on_touch_move_native = useCallback(
    (e: globalThis.TouchEvent) => {
      if (!mobile || !active || !start_ref.current || snapping) return;

      const touch = e.touches[0];
      if (!touch) return;

      const dx = touch.clientX - start_ref.current.x;
      const dy = touch.clientY - start_ref.current.y;

      if (mode_ref.current === 'none') {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;

        const scroll_top = get_scroll_top_ref.current?.() ?? 0;
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) && scroll_top <= 0) {
          mode_ref.current = 'vertical';
        } else if (
          dx > 0 &&
          Math.abs(dx) > Math.abs(dy) &&
          can_back_ref.current &&
          on_back_ref.current
        ) {
          mode_ref.current = 'horizontal';
        } else {
          start_ref.current = null;
          return;
        }
      }

      if (mode_ref.current === 'vertical') {
        const y = Math.max(0, dy);
        write_offset({ x: 0, y });
        if (y > 6) e.preventDefault();
        return;
      }

      if (mode_ref.current === 'horizontal') {
        const x = Math.max(0, dx);
        write_offset({ x, y: 0 });
        if (x > 6) e.preventDefault();
      }
    },
    [mobile, active, snapping, write_offset]
  );

  const on_touch_end_native = useCallback(() => {
    if (!mobile || !active || snapping) {
      clear_gesture();
      return;
    }

    if (!start_ref.current) return;

    const { x, y } = offset_ref.current;
    const mode = mode_ref.current;

    if (mode === 'vertical' && y >= DISMISS_THRESHOLD) {
      clear_gesture();
      on_dismiss_ref.current();
      return;
    }

    if (mode === 'horizontal' && x >= BACK_THRESHOLD && on_back_ref.current) {
      clear_gesture();
      on_back_ref.current();
      return;
    }

    if (mode !== 'none' && (x > 0 || y > 0)) {
      set_snapping(true);
      requestAnimationFrame(() => write_offset({ x: 0, y: 0 }));
      window.setTimeout(() => clear_gesture(), SNAP_MS);
      return;
    }

    clear_gesture();
  }, [mobile, active, snapping, clear_gesture, write_offset]);

  const bind_listeners = useCallback(
    (node: HTMLDivElement | null) => {
      const prev = sheet_ref.current;
      if (prev) {
        prev.removeEventListener('touchstart', on_touch_start_native, true);
        prev.removeEventListener('touchmove', on_touch_move_native, true);
        prev.removeEventListener('touchend', on_touch_end_native, true);
        prev.removeEventListener('touchcancel', on_touch_end_native, true);
      }

      sheet_ref.current = node;

      if (!node || !mobile) return;

      node.addEventListener('touchstart', on_touch_start_native, { capture: true });
      node.addEventListener('touchmove', on_touch_move_native, { capture: true, passive: false });
      node.addEventListener('touchend', on_touch_end_native, { capture: true });
      node.addEventListener('touchcancel', on_touch_end_native, { capture: true });
    },
    [mobile, on_touch_start_native, on_touch_move_native, on_touch_end_native]
  );

  const dragging = offset.x > 0 || offset.y > 0;

  const sheet_style: CSSProperties | undefined =
    mobile && (dragging || snapping)
      ? {
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          transition: snapping
            ? `transform ${SNAP_MS}ms cubic-bezier(0.33, 1, 0.38, 1)`
            : 'none',
        }
      : undefined;

  const backdrop_style: CSSProperties | undefined =
    mobile && offset.y > 0
      ? {
          opacity: Math.max(0, 0.45 * (1 - offset.y / 320)),
          transition: 'none',
        }
      : undefined;

  const sheet_props = mobile
    ? {
        ref: bind_listeners as Ref<HTMLDivElement>,
        style: sheet_style,
      }
    : {};

  return {
    sheet_props,
    backdrop_style,
  };
}
