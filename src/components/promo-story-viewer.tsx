'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { promo_banner } from '@/lib/types';

type props = {
  promos: promo_banner[];
  start_index: number;
  open: boolean;
  on_close: () => void;
  // вызывается при нажатии кнопки перехода
  on_action: (promo: promo_banner) => void;
  // вызывается когда акция показана (для отметки «просмотрено»)
  on_view?: (promo: promo_banner) => void;
};

// длительность показа одной акции, мс (как сторис в инсте)
const STORY_DURATION_MS = 6000;
// удержание дольше этого времени считается «паузой», а не тапом
const TAP_MAX_MS = 220;

export function promo_has_target(promo: promo_banner): boolean {
  return Boolean(promo.menu_id || promo.category || (promo.link_url && promo.link_url !== '/'));
}

export default function promo_story_viewer({
  promos,
  start_index,
  open,
  on_close,
  on_action,
  on_view,
}: props) {
  const [index, set_index] = useState(start_index);
  const [progress, set_progress] = useState(0);
  const [paused, set_paused] = useState(false);

  const raf_ref = useRef<number>(0);
  const start_ts_ref = useRef<number>(0);
  const elapsed_ref = useRef<number>(0);
  const pointer_ts_ref = useRef<number>(0);
  const on_view_ref = useRef(on_view);
  on_view_ref.current = on_view;

  const count = promos.length;
  const current = promos[index];

  // отмечаем текущую акцию просмотренной
  useEffect(() => {
    if (open && promos[index]) on_view_ref.current?.(promos[index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  useEffect(() => {
    if (open) {
      set_index(start_index);
      set_progress(0);
      elapsed_ref.current = 0;
    }
  }, [open, start_index]);

  const go_to = useCallback(
    (next: number) => {
      elapsed_ref.current = 0;
      set_progress(0);
      set_index(next);
    },
    []
  );

  const go_next = useCallback(() => {
    if (index >= count - 1) {
      on_close();
      return;
    }
    go_to(index + 1);
  }, [index, count, go_to, on_close]);

  const go_prev = useCallback(() => {
    if (index <= 0) {
      go_to(0);
      return;
    }
    go_to(index - 1);
  }, [index, go_to]);

  // таймер прогресса на requestAnimationFrame (поддерживает паузу)
  useEffect(() => {
    if (!open || count === 0) return;

    function tick(ts: number) {
      if (start_ts_ref.current === 0) start_ts_ref.current = ts;
      const delta = ts - start_ts_ref.current;
      start_ts_ref.current = ts;

      if (!paused) {
        elapsed_ref.current += delta;
        const p = Math.min(elapsed_ref.current / STORY_DURATION_MS, 1);
        set_progress(p);
        if (p >= 1) {
          go_next();
          return;
        }
      }
      raf_ref.current = requestAnimationFrame(tick);
    }

    start_ts_ref.current = 0;
    raf_ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf_ref.current);
  }, [open, paused, index, count, go_next]);

  // блокируем скролл body и слушаем клавиатуру
  useEffect(() => {
    if (!open) return;
    const prev_overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') on_close();
      else if (e.key === 'ArrowRight') go_next();
      else if (e.key === 'ArrowLeft') go_prev();
    }
    window.addEventListener('keydown', on_key);
    return () => {
      document.body.style.overflow = prev_overflow;
      window.removeEventListener('keydown', on_key);
    };
  }, [open, on_close, go_next, go_prev]);

  if (!open || !current) return null;

  const has_target = promo_has_target(current);
  const cta_label = current.cta_label?.trim() || 'перейти';

  function handle_pointer_down() {
    pointer_ts_ref.current = performance.now();
    set_paused(true);
  }

  function handle_pointer_up(e: React.PointerEvent<HTMLButtonElement>, zone: 'left' | 'right') {
    const held = performance.now() - pointer_ts_ref.current;
    set_paused(false);
    if (held <= TAP_MAX_MS) {
      if (zone === 'left') go_prev();
      else go_next();
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center">
      <div className="relative w-full h-full max-w-[460px] mx-auto overflow-hidden bg-black min-[500px]:rounded-2xl">
        {/* целиком без обрезки — contain */}
        <img
          src={current.image_url}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-contain object-center"
          draggable={false}
        />

        {/* полоски прогресса */}
        <div className="absolute top-0 inset-x-0 z-30 flex gap-1 px-3 pt-3">
          {promos.map((p, i) => (
            <div
              key={p.id}
              className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width:
                    i < index ? '100%' : i === index ? `${progress * 100}%` : '0%',
                  transition: i === index ? 'none' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* шапка: заголовок + закрыть */}
        <div className="absolute top-0 inset-x-0 z-30 flex items-start justify-between gap-3 px-4 pt-7">
          {!current.title_in_image ? (
            <p className="text-white text-[15px] font-semibold leading-tight pt-1">
              {current.title}
            </p>
          ) : (
            <span className="pt-1" />
          )}
          <button
            type="button"
            onClick={on_close}
            aria-label="закрыть"
            className="flex-shrink-0 -mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* зоны тапа: влево/вправо + удержание для паузы */}
        <div className="absolute inset-0 z-10 flex">
          <button
            type="button"
            aria-label="предыдущая акция"
            className="w-1/3 h-full"
            onPointerDown={handle_pointer_down}
            onPointerUp={(e) => handle_pointer_up(e, 'left')}
            onPointerLeave={() => set_paused(false)}
          />
          <button
            type="button"
            aria-label="следующая акция"
            className="flex-1 h-full"
            onPointerDown={handle_pointer_down}
            onPointerUp={(e) => handle_pointer_up(e, 'right')}
            onPointerLeave={() => set_paused(false)}
          />
        </div>

        {/* нижняя часть: подзаголовок + кнопка перехода */}
        <div className="absolute bottom-0 inset-x-0 z-30 px-4 pb-[calc(1.25rem+var(--safe-bottom,0px))] pt-6">
          {current.subtitle && (
            <p className="text-white/90 text-sm mb-3 max-w-[90%]">
              {current.subtitle}
            </p>
          )}
          {has_target && (
            <button
              type="button"
              onClick={() => on_action(current)}
              className="w-full rounded-pill bg-white text-neutral-900 py-3.5 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
            >
              {cta_label}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
