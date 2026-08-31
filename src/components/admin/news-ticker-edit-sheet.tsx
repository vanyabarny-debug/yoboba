'use client';

import { createElement, useEffect, useState } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';
import {
  NEWS_TICKER_BG_PRESETS,
  NEWS_TICKER_TEXT_PRESETS,
  default_news_ticker,
  normalize_news_ticker,
  type news_ticker_settings,
} from '@/lib/news-ticker-store';

type props = {
  open: boolean;
  settings: news_ticker_settings | null;
  on_close: () => void;
  on_save: (settings: news_ticker_settings) => void;
};

function color_row({
  label,
  value,
  presets,
  on_change,
}: {
  label: string;
  value: string;
  presets: readonly string[];
  on_change: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => on_change(hex)}
            className={`size-8 rounded-lg border-2 transition-transform ${
              value.toLowerCase() === hex.toLowerCase()
                ? 'border-neutral-900 scale-105'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
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
          placeholder="#ffe14d"
          className="flex-1 rounded-xl border border-surface px-3 py-2 text-sm font-mono"
        />
      </div>
    </div>
  );
}

export default function news_ticker_edit_sheet({
  open,
  settings,
  on_close,
  on_save,
}: props) {
  const [draft, set_draft] = useState<news_ticker_settings>(default_news_ticker);

  useEffect(() => {
    if (!open) return;
    set_draft(normalize_news_ticker(settings));
  }, [open, settings]);

  if (!open) return null;

  return createElement(admin_sheet, {
    open: true,
    title: 'бегущая строка',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          on_save(normalize_news_ticker(draft));
          on_close();
        }}
        className="space-y-4"
      >
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-neutral-500">текст</span>
          <textarea
            value={draft.text}
            onChange={(e) => set_draft({ ...draft, text: e.target.value })}
            rows={2}
            placeholder="скоро открытие"
            className="w-full rounded-xl border border-surface px-3 py-2 text-sm resize-y"
            required
          />
        </label>

        {color_row({
          label: 'цвет фона',
          value: draft.bg_color,
          presets: NEWS_TICKER_BG_PRESETS,
          on_change: (bg_color) => set_draft({ ...draft, bg_color }),
        })}

        {color_row({
          label: 'цвет текста',
          value: draft.text_color,
          presets: NEWS_TICKER_TEXT_PRESETS,
          on_change: (text_color) => set_draft({ ...draft, text_color }),
        })}

        <div
          className="overflow-hidden rounded-[10px] px-3 py-2 text-[13px] font-extrabold"
          style={{ backgroundColor: draft.bg_color, color: draft.text_color }}
        >
          {draft.text.trim() || 'preview'}
        </div>

        <div className="flex gap-2 pt-1">
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
