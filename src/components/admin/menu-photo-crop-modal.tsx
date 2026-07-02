'use client';

import { useEffect, useRef, useState } from 'react';
import {
  default_menu_photo_crop,
  export_menu_photo_crop,
  get_menu_photo_layout,
  load_image_from_file,
  type menu_photo_crop,
} from '@/lib/menu-photo';

type props = {
  open: boolean;
  file: File | null;
  title?: string;
  on_close: () => void;
  on_save: (data_url: string) => void;
};

export default function menu_photo_crop_modal({
  open,
  file,
  title = 'фото товара',
  on_close,
  on_save,
}: props) {
  const viewport_ref = useRef<HTMLDivElement>(null);
  const drag_ref = useRef<{ x: number; y: number; pan_x: number; pan_y: number } | null>(null);

  const [img, set_img] = useState<HTMLImageElement | null>(null);
  const [crop, set_crop] = useState<menu_photo_crop>(default_menu_photo_crop);
  const [viewport_px, set_viewport_px] = useState(320);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      set_img(null);
      set_crop(default_menu_photo_crop);
      return;
    }
    let cancelled = false;
    load_image_from_file(file)
      .then((loaded) => {
        if (!cancelled) set_img(loaded);
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : 'ошибка загрузки');
        on_close();
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, on_close]);

  useEffect(() => {
    if (!open) return;
    const el = viewport_ref.current;
    if (!el) return;
    function measure() {
      if (viewport_ref.current) {
        set_viewport_px(viewport_ref.current.clientWidth);
      }
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  function clamp_pan(next: menu_photo_crop): menu_photo_crop {
    if (!img) return next;
    const { draw_w, draw_h } = get_menu_photo_layout(img, viewport_px, next);
    const max_pan_x = Math.max(0, (draw_w - viewport_px) / 2);
    const max_pan_y = Math.max(0, (draw_h - viewport_px) / 2);
    return {
      scale: next.scale,
      pan_x: Math.min(max_pan_x, Math.max(-max_pan_x, next.pan_x)),
      pan_y: Math.min(max_pan_y, Math.max(-max_pan_y, next.pan_y)),
    };
  }

  function on_pointer_down(e: React.PointerEvent) {
    if (!img) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag_ref.current = {
      x: e.clientX,
      y: e.clientY,
      pan_x: crop.pan_x,
      pan_y: crop.pan_y,
    };
  }

  function on_pointer_move(e: React.PointerEvent) {
    if (!drag_ref.current) return;
    const dx = e.clientX - drag_ref.current.x;
    const dy = e.clientY - drag_ref.current.y;
    set_crop((prev) =>
      clamp_pan({
        ...prev,
        pan_x: drag_ref.current!.pan_x + dx,
        pan_y: drag_ref.current!.pan_y + dy,
      })
    );
  }

  function on_pointer_up() {
    drag_ref.current = null;
  }

  async function handle_save() {
    if (!img) return;
    set_saving(true);
    try {
      const data_url = export_menu_photo_crop(img, viewport_px, crop);
      on_save(data_url);
      on_close();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'не удалось сохранить');
    } finally {
      set_saving(false);
    }
  }

  if (!open) return null;

  const layout = img ? get_menu_photo_layout(img, viewport_px, crop) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="закрыть"
        className="absolute inset-0 bg-black/50"
        onClick={on_close}
      />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-card p-5 shadow-soft">
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-xs text-neutral-500 mb-4">
          квадрат 1:1 — двигай и масштабируй, как на карточке товара
        </p>

        <div
          ref={viewport_ref}
          className="relative mx-auto w-full max-w-[360px] aspect-square rounded-card overflow-hidden bg-[#f1f1f3] touch-none select-none"
          onPointerDown={on_pointer_down}
          onPointerMove={on_pointer_move}
          onPointerUp={on_pointer_up}
          onPointerCancel={on_pointer_up}
        >
          {img && layout ? (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{
                width: layout.draw_w,
                height: layout.draw_h,
                left: layout.draw_x,
                top: layout.draw_y,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
              загрузка…
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10 rounded-card" />
        </div>

        <label className="mt-4 block text-xs text-neutral-500">
          масштаб
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={crop.scale}
            onChange={(e) =>
              set_crop((prev) => clamp_pan({ ...prev, scale: Number(e.target.value) }))
            }
            className="mt-2 w-full accent-accent"
          />
        </label>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={on_close}
            className="flex-1 rounded-pill border border-surface py-2.5 text-sm"
          >
            отмена
          </button>
          <button
            type="button"
            disabled={!img || saving}
            onClick={() => void handle_save()}
            className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'сохраняем…' : 'сохранить фото'}
          </button>
        </div>
      </div>
    </div>
  );
}
