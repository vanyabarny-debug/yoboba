'use client';

import { useEffect, useState, createElement } from 'react';
import type { sidebar_ad_slide } from '@/lib/types';
import edit_pencil from '@/components/admin/edit-pencil';

type props = {
  slides: sidebar_ad_slide[];
  interval_ms?: number;
  on_slide_click: (slide: sidebar_ad_slide) => void;
  edit_mode?: boolean;
  on_edit_slide?: (slide: sidebar_ad_slide) => void;
  on_add_slide?: () => void;
};

export default function sidebar_ad({
  slides,
  interval_ms = 5000,
  on_slide_click,
  edit_mode = false,
  on_edit_slide,
  on_add_slide,
}: props) {
  const active = edit_mode ? slides : slides.filter((s) => s.is_active);
  const [idx, set_idx] = useState(0);

  useEffect(() => {
    set_idx(0);
  }, [active.length]);

  useEffect(() => {
    if (edit_mode || active.length <= 1) return;
    const timer = setInterval(() => {
      set_idx((prev) => (prev + 1) % active.length);
    }, interval_ms);
    return () => clearInterval(timer);
  }, [active.length, interval_ms, edit_mode]);

  if (!active.length && edit_mode) {
    return (
      <button
        type="button"
        onClick={on_add_slide}
        className="relative w-full aspect-[5/8] rounded-card border border-dashed border-surface bg-white text-sm text-neutral-500"
      >
        + рекламный баннер
      </button>
    );
  }

  if (!active.length) return null;

  const current = active[idx] ?? active[0];

  return (
    <div className="relative w-full aspect-[5/8] rounded-card overflow-hidden isolate">
        {active.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => (edit_mode ? on_edit_slide?.(slide) : on_slide_click(slide))}
            className={`absolute inset-0 text-left transition-opacity duration-700 ease-in-out ${
              i === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            } ${edit_mode && !slide.is_active && i === idx ? 'brightness-75' : ''}`}
            aria-hidden={i !== idx}
          >
            <img
              src={slide.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-x-0 top-0 p-4">
              <p className="font-bold text-white text-base leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                {slide.title}
              </p>
              {slide.subtitle && (
                <p className="text-white/90 text-xs mt-1 leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  {slide.subtitle}
                </p>
              )}
            </div>
          </button>
        ))}

        {edit_mode && on_edit_slide && current && (
          <div className="absolute top-3 right-3 z-30 flex gap-1">
            {createElement(edit_pencil, {
              label: `править «${current.title}»`,
              onClick: () => on_edit_slide(current),
            })}
            {on_add_slide && (
              <button
                type="button"
                onClick={on_add_slide}
                className="h-7 rounded-full bg-white/95 px-2 text-xs font-medium text-accent shadow"
              >
                +
              </button>
            )}
          </div>
        )}

        {!edit_mode && active.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5 pointer-events-none">
            {active.map((slide, i) => (
              <span
                key={slide.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/45'
                }`}
              />
            ))}
          </div>
        )}

        <span className="sr-only">{current.title}</span>
    </div>
  );
}
