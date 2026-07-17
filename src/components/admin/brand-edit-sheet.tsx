'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';
import {
  apply_brand_theme,
  brand_font_display_options,
  brand_font_labels,
  brand_font_sans_options,
  brand_font_stacks,
  get_brand_settings,
  type brand_font_id,
  type brand_font_weight,
  type brand_settings,
} from '@/lib/brand-store';
import {
  brand_font_weight_label,
  brand_font_weight_options,
  clamp_font_weight,
  load_brand_google_fonts,
} from '@/lib/brand-font-catalog';

type props = {
  open: boolean;
  focus?: 'logo' | 'tagline' | 'all';
  on_close: () => void;
  on_save: (settings: brand_settings) => brand_settings | void;
};

function color_field({
  label,
  value,
  on_change,
}: {
  label: string;
  value: string;
  on_change: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => on_change(e.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-surface bg-white p-0.5"
        />
        <input
          value={value}
          onChange={(e) => on_change(e.target.value)}
          placeholder="#0039A6"
          className="flex-1 rounded-xl border border-surface px-3 py-2 text-sm font-mono"
        />
      </div>
    </label>
  );
}

export default function brand_edit_sheet({ open, focus = 'all', on_close, on_save }: props) {
  const [draft, set_draft] = useState<brand_settings>(() => get_brand_settings());
  const [snapshot, set_snapshot] = useState<brand_settings | null>(null);
  const draft_ref = useRef(draft);
  draft_ref.current = draft;

  useEffect(() => {
    if (!open) return;
    const current = get_brand_settings();
    set_draft(current);
    set_snapshot(current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load_brand_google_fonts(draft.font_sans, draft.font_display);
    apply_brand_theme(draft);
  }, [open, draft]);

  function handle_cancel() {
    if (snapshot) {
      load_brand_google_fonts(snapshot.font_sans, snapshot.font_display);
      apply_brand_theme(snapshot);
    }
    on_close();
  }

  function handle_save(e: React.FormEvent) {
    e.preventDefault();
    const saved = on_save(draft_ref.current);
    const next = saved ?? draft_ref.current;
    set_snapshot(next);
    set_draft(next);
    on_close();
  }

  function set_display_font(font_display: brand_font_id) {
    set_draft((prev) => ({
      ...prev,
      font_display,
      display_weight: clamp_font_weight(font_display, prev.display_weight),
    }));
  }

  if (!open) return null;

  const show_logo = focus === 'all' || focus === 'logo';
  const show_tagline = focus === 'all' || focus === 'tagline';
  const show_theme = focus === 'all' || focus === 'logo';
  const weight_options = brand_font_weight_options(draft.font_display);

  return createElement(admin_sheet, {
    open: true,
    title:
      focus === 'logo'
        ? 'логотип'
        : focus === 'tagline'
          ? 'слоган'
          : 'бренд и оформление',
    on_close: handle_cancel,
    children: (
      <form onSubmit={handle_save} className="space-y-4">
        {show_logo && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">текст логотипа</p>
            <input
              value={draft.brand_word}
              onChange={(e) => set_draft({ ...draft, brand_word: e.target.value })}
              placeholder="yomoyo"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
            <input
              value={draft.brand_suffix}
              onChange={(e) => set_draft({ ...draft, brand_suffix: e.target.value })}
              placeholder=" Cha"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-neutral-400">
              превью:{' '}
              <span
                className="leading-none text-neutral-900 text-2xl"
                style={{
                  fontFamily: brand_font_stacks[draft.font_display],
                  fontWeight: draft.display_weight,
                  letterSpacing: `${draft.display_tracking}em`,
                  fontSynthesis: 'none',
                  zoom: draft.display_scale,
                }}
              >
                {draft.brand_word || '…'}
                {draft.brand_suffix}
              </span>
            </p>
          </div>
        )}

        {show_tagline && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-500">слоган под логотипом</span>
            <input
              value={draft.tagline}
              onChange={(e) => set_draft({ ...draft, tagline: e.target.value })}
              placeholder="первая баблтишная в городе"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
          </label>
        )}

        {show_theme && (
          <>
            <div className="space-y-2 rounded-xl border border-surface bg-surface/40 p-3">
              <p className="text-xs font-medium text-neutral-500">основные цвета</p>
              {color_field({
                label: 'красный (кнопки, акценты)',
                value: draft.color_accent,
                on_change: (color_accent) => set_draft({ ...draft, color_accent }),
              })}
              {color_field({
                label: 'тёмно-красный (hover)',
                value: draft.color_accent_pink,
                on_change: (color_accent_pink) => set_draft({ ...draft, color_accent_pink }),
              })}
              {color_field({
                label: 'фон страницы',
                value: draft.color_background,
                on_change: (color_background) => set_draft({ ...draft, color_background }),
              })}
              {color_field({
                label: 'цвет текста',
                value: draft.color_foreground,
                on_change: (color_foreground) => set_draft({ ...draft, color_foreground }),
              })}
            </div>

            <div className="space-y-2 rounded-xl border border-surface bg-surface/40 p-3">
              <p className="text-xs font-medium text-neutral-500">шрифты</p>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">основной текст</span>
                <select
                  value={draft.font_sans}
                  onChange={(e) =>
                    set_draft({ ...draft, font_sans: e.target.value as brand_font_id })
                  }
                  className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
                >
                  {brand_font_sans_options.map((id) => (
                    <option key={id} value={id}>
                      {brand_font_labels[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">логотип и заголовки</span>
                <select
                  value={draft.font_display}
                  onChange={(e) => set_display_font(e.target.value as brand_font_id)}
                  className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
                >
                  {brand_font_display_options.map((id) => (
                    <option key={id} value={id}>
                      {brand_font_labels[id]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-500">
                  начертание (только доступные у шрифта)
                </span>
                <select
                  value={draft.display_weight}
                  onChange={(e) =>
                    set_draft({
                      ...draft,
                      display_weight: Number(e.target.value) as brand_font_weight,
                    })
                  }
                  className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
                >
                  {weight_options.map((weight) => (
                    <option key={weight} value={weight}>
                      {brand_font_weight_label(weight)}
                    </option>
                  ))}
                </select>
                {weight_options.length === 1 && (
                  <span className="block text-[11px] text-neutral-400">
                    у этого шрифта одно начертание — fake-bold отключён
                  </span>
                )}
              </label>
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs text-neutral-500">
                  <span>межбуквенное расстояние</span>
                  <span className="font-mono text-neutral-700">
                    {draft.display_tracking.toFixed(3)}em
                  </span>
                </span>
                <input
                  type="range"
                  min={-0.08}
                  max={0.16}
                  step={0.005}
                  value={draft.display_tracking}
                  onChange={(e) =>
                    set_draft({
                      ...draft,
                      display_tracking: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[var(--color-accent)]"
                />
                <span className="flex justify-between text-[10px] text-neutral-400">
                  <span>теснее</span>
                  <span>шире</span>
                </span>
              </label>
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-xs text-neutral-500">
                  <span>масштаб заголовков и акцентов</span>
                  <span className="font-mono text-neutral-700">
                    {Math.round(draft.display_scale * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.05}
                  value={draft.display_scale}
                  onChange={(e) =>
                    set_draft({
                      ...draft,
                      display_scale: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[var(--color-accent)]"
                />
                <span className="flex justify-between text-[10px] text-neutral-400">
                  <span>мельче</span>
                  <span>крупнее</span>
                </span>
              </label>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handle_cancel}
            className="flex-1 rounded-pill border border-surface py-2.5 text-sm"
          >
            отмена
          </button>
          <button
            type="submit"
            className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium"
          >
            сохранить
          </button>
        </div>
      </form>
    ),
  });
}
