'use client';

import { createElement, useRef, useState } from 'react';
import type { promo_title_layout } from '@/lib/promo-title-layout';
import {
  PROMO_TITLE_COLOR_PRESETS,
  PROMO_TITLE_EDGE_INSET,
  PROMO_TITLE_SNAP_POINTS,
  default_promo_title_layout,
  merge_snap_layout,
  normalize_promo_title_color,
  type promo_title_anchor,
} from '@/lib/promo-title-layout';
import promo_image_with_title from '@/components/promo-image-with-title';
import type { promo_banner } from '@/lib/types';
import {
  default_promo_image_vignette,
  type promo_image_vignette,
} from '@/lib/promo-image-vignette';

type props = {
  title: string;
  image_url: string;
  title_in_image?: boolean;
  layout: promo_title_layout;
  on_change: (layout: promo_title_layout) => void;
  vignette?: promo_image_vignette | null;
  on_vignette_change: (vignette: promo_image_vignette | null) => void;
};

const WEIGHTS: promo_title_layout['font_weight'][] = [600, 700, 800, 900];

type eye_dropper_result = { sRGBHex: string };

export default function promo_title_layout_editor({
  title,
  image_url,
  title_in_image = false,
  layout,
  on_change,
  vignette,
  on_vignette_change,
}: props) {
  const color_input_ref = useRef<HTMLInputElement>(null);
  const [pipette_busy, set_pipette_busy] = useState(false);
  const [pipette_error, set_pipette_error] = useState<string | null>(null);

  const resolved = { ...default_promo_title_layout(), ...layout, color: normalize_promo_title_color(layout.color) };
  const resolved_vignette = { ...default_promo_image_vignette(), ...vignette };
  const vignette_on = resolved_vignette.strength > 0;

  const preview_promo: promo_banner = {
    id: 'preview',
    title,
    image_url,
    title_in_image,
    title_layout: title_in_image ? undefined : resolved,
    image_vignette: vignette_on ? resolved_vignette : null,
    is_active: true,
  };

  function set_vignette(patch: Partial<promo_image_vignette>) {
    const next = { ...resolved_vignette, ...patch };
    if (next.strength <= 0) {
      on_vignette_change(null);
      return;
    }
    on_vignette_change(next);
  }

  function snap_to(id: promo_title_anchor) {
    const point = PROMO_TITLE_SNAP_POINTS.find((p) => p.id === id);
    if (!point) return;
    on_change(
      merge_snap_layout(resolved, {
        ...point.layout,
        font_size: resolved.font_size,
        font_weight: resolved.font_weight,
        color: resolved.color,
        stroke: resolved.stroke,
        shadow: resolved.shadow,
      })
    );
  }

  async function pick_with_eyedropper() {
    set_pipette_error(null);
    if (typeof window === 'undefined') return;
    const EyeDropper = (window as Window & { EyeDropper?: new () => { open: () => Promise<eye_dropper_result> } })
      .EyeDropper;
    if (!EyeDropper) {
      set_pipette_error('пипетка доступна в Chrome / Edge на компьютере');
      color_input_ref.current?.click();
      return;
    }
    set_pipette_busy(true);
    try {
      const dropper = new EyeDropper();
      const result = await dropper.open();
      on_change({ ...resolved, color: normalize_promo_title_color(result.sRGBHex) });
    } catch {
      /* пользователь закрыл пипетку */
    } finally {
      set_pipette_busy(false);
    }
  }

  return (
    <div className="rounded-xl border border-surface bg-surface/30 p-3 space-y-3">
      <p className="text-xs font-medium text-neutral-500">оформление фото</p>

      <div className="mx-auto w-full max-w-[220px] aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-black/10 relative">
        <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
          <div
            className="absolute top-0 bottom-0 w-px bg-white/25"
            style={{ left: `${PROMO_TITLE_EDGE_INSET}%` }}
          />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/35" />
          <div
            className="absolute top-0 bottom-0 w-px bg-white/25"
            style={{ left: `${100 - PROMO_TITLE_EDGE_INSET}%` }}
          />
          <div
            className="absolute left-0 right-0 h-px bg-white/25"
            style={{ top: `${PROMO_TITLE_EDGE_INSET}%` }}
          />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/35" />
          <div
            className="absolute left-0 right-0 h-px bg-white/25"
            style={{ top: `${100 - PROMO_TITLE_EDGE_INSET}%` }}
          />
        </div>
        {createElement(promo_image_with_title, {
          promo: preview_promo,
          interactive: !title_in_image,
          on_layout_change: title_in_image ? undefined : on_change,
        })}
      </div>

      <div className="space-y-2 rounded-lg border border-surface bg-white p-3">
        <p className="text-[11px] font-medium text-neutral-500">виньетка сверху (коралловая)</p>
        <div className="flex gap-1.5">
          {([
            { id: 'off', label: 'выкл', edge: null },
            { id: 'top', label: 'сверху', edge: 'top' as const },
          ]).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (!opt.edge) {
                  on_vignette_change(null);
                  return;
                }
                set_vignette({
                  edge: 'top',
                  strength: vignette_on ? resolved_vignette.strength : 30,
                });
              }}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${
                (opt.edge === null && !vignette_on) ||
                (opt.edge === resolved_vignette.edge && vignette_on)
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface bg-white text-neutral-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {vignette_on ? (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <span>сила</span>
              <span className="tabular-nums text-neutral-700">{resolved_vignette.strength}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={1}
              value={resolved_vignette.strength}
              onChange={(e) =>
                set_vignette({ strength: Number(e.target.value) || resolved_vignette.strength })
              }
              className="w-full accent-accent"
            />
          </div>
        ) : null}
      </div>

      {!title_in_image ? (
        <>
      <p className="text-[11px] text-neutral-400 text-center">
        перетащи текст · при отпускании примагнитится к центру, осям и углам
      </p>

      <div className="space-y-2">
        <p className="text-[11px] text-neutral-500">цвет текста</p>
        <div className="flex flex-wrap gap-1.5">
          {PROMO_TITLE_COLOR_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`цвет ${hex}`}
              onClick={() => on_change({ ...resolved, color: hex })}
              className={`size-8 rounded-lg border-2 transition-transform active:scale-95 ${
                resolved.color === hex ? 'border-accent ring-2 ring-accent/30' : 'border-white ring-1 ring-black/10'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
          <button
            type="button"
            onClick={() => color_input_ref.current?.click()}
            className="size-8 rounded-lg border border-surface bg-white text-[10px] font-semibold text-neutral-600"
            title="свой цвет"
          >
            …
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={color_input_ref}
            type="color"
            value={resolved.color}
            onChange={(e) => on_change({ ...resolved, color: normalize_promo_title_color(e.target.value) })}
            className="h-9 w-12 cursor-pointer rounded-lg border border-surface bg-white p-0.5"
            aria-label="выбрать цвет"
          />
          <input
            type="text"
            value={resolved.color}
            onChange={(e) => on_change({ ...resolved, color: normalize_promo_title_color(e.target.value) })}
            className="min-w-0 flex-1 rounded-lg border border-surface bg-white px-2.5 py-2 text-xs font-mono uppercase"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void pick_with_eyedropper()}
            disabled={pipette_busy}
            className="rounded-lg border border-surface bg-white px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-50"
          >
            {pipette_busy ? '…' : 'пипетка'}
          </button>
        </div>
        {pipette_error ? <p className="text-[11px] text-neutral-400">{pipette_error}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-1 min-w-[120px] items-center gap-2 rounded-lg border border-surface bg-white px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={resolved.shadow !== false}
            onChange={(e) => on_change({ ...resolved, shadow: e.target.checked })}
          />
          тень
        </label>
        <label className="flex flex-1 min-w-[120px] items-center gap-2 rounded-lg border border-surface bg-white px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={resolved.stroke === true}
            onChange={(e) => on_change({ ...resolved, stroke: e.target.checked })}
          />
          обводка
        </label>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-neutral-500">привязка</p>
        <div className="grid grid-cols-3 gap-1.5">
          {PROMO_TITLE_SNAP_POINTS.map((point) => (
            <button
              key={point.id}
              type="button"
              onClick={() => snap_to(point.id)}
              className={`rounded-lg border py-2 text-sm font-semibold transition-colors ${
                resolved.anchor === point.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface bg-white text-neutral-700 hover:border-neutral-300'
              }`}
              title={point.id}
            >
              {point.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>размер</span>
          <span className="tabular-nums text-neutral-700">{resolved.font_size}px</span>
        </div>
        <input
          type="range"
          min={10}
          max={44}
          step={1}
          value={resolved.font_size}
          onChange={(e) =>
            on_change({ ...resolved, font_size: Number(e.target.value) || resolved.font_size })
          }
          className="w-full accent-accent"
        />
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-neutral-500">жирность</p>
        <div className="flex gap-1.5">
          {WEIGHTS.map((weight) => (
            <button
              key={weight}
              type="button"
              onClick={() => on_change({ ...resolved, font_weight: weight })}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${
                resolved.font_weight === weight
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface bg-white text-neutral-700'
              }`}
            >
              {weight}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-neutral-500">выравнивание строк</p>
        <div className="flex gap-1.5">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => on_change({ ...resolved, text_align: align })}
              className={`flex-1 rounded-lg border py-2 text-xs font-semibold capitalize ${
                resolved.text_align === align
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-surface bg-white text-neutral-700'
              }`}
            >
              {align === 'left' ? 'слева' : align === 'center' ? 'центр' : 'справа'}
            </button>
          ))}
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
