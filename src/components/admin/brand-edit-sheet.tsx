'use client';

import { createElement, useEffect, useState } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';
import {
  brand_font_labels,
  get_brand_settings,
  type brand_font_id,
  type brand_settings,
} from '@/lib/brand-store';

type props = {
  open: boolean;
  focus?: 'logo' | 'tagline' | 'all';
  on_close: () => void;
  on_save: (settings: brand_settings) => void;
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
          placeholder="#0468F0"
          className="flex-1 rounded-xl border border-surface px-3 py-2 text-sm font-mono"
        />
      </div>
    </label>
  );
}

export default function brand_edit_sheet({ open, focus = 'all', on_close, on_save }: props) {
  const [draft, set_draft] = useState<brand_settings>(() => get_brand_settings());

  useEffect(() => {
    if (open) set_draft(get_brand_settings());
  }, [open]);

  if (!open) return null;

  const show_logo = focus === 'all' || focus === 'logo';
  const show_tagline = focus === 'all' || focus === 'tagline';
  const show_theme = focus === 'all' || focus === 'logo';

  return createElement(admin_sheet, {
    open: true,
    title:
      focus === 'logo'
        ? 'логотип'
        : focus === 'tagline'
          ? 'слоган'
          : 'бренд и оформление',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          on_save(draft);
          on_close();
        }}
        className="space-y-4"
      >
        {show_logo && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">текст логотипа</p>
            <input
              value={draft.brand_word}
              onChange={(e) => set_draft({ ...draft, brand_word: e.target.value })}
              placeholder="koppu"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
            <input
              value={draft.brand_suffix}
              onChange={(e) => set_draft({ ...draft, brand_suffix: e.target.value })}
              placeholder=" x"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-neutral-400">
              превью:{' '}
              <span className="font-display font-bold lowercase">
                <span style={{ color: draft.color_accent }}>{draft.brand_word || '…'}</span>
                <span style={{ color: draft.color_accent_pink }}>{draft.brand_suffix}</span>
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
                label: 'синий (логотип, кнопки)',
                value: draft.color_accent,
                on_change: (color_accent) => set_draft({ ...draft, color_accent }),
              })}
              {color_field({
                label: 'розовый (акцент логотипа)',
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
                  {(Object.keys(brand_font_labels) as brand_font_id[]).map((id) => (
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
                  onChange={(e) =>
                    set_draft({ ...draft, font_display: e.target.value as brand_font_id })
                  }
                  className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
                >
                  {(Object.keys(brand_font_labels) as brand_font_id[]).map((id) => (
                    <option key={id} value={id}>
                      {brand_font_labels[id]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={on_close}
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
