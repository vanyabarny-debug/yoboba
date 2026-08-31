'use client';

import { createElement, useEffect, useState } from 'react';
import edit_pencil from '@/components/admin/edit-pencil';
import {
  default_news_ticker,
  get_news_ticker_settings,
  subscribe_news_ticker_store,
  type news_ticker_settings,
} from '@/lib/news-ticker-store';

const ticker_repeat = 12;

type props = {
  edit_mode?: boolean;
  on_edit?: () => void;
  /** без page-shell — когда рядом второй блок на главной */
  embedded?: boolean;
};

function ticker_chunk(text: string) {
  return Array.from({ length: ticker_repeat }, (_, i) => (
    <span
      key={i}
      className="inline-flex shrink-0 items-center gap-4 pr-4 sm:gap-5 sm:pr-5"
    >
      <span>{text}</span>
      <span className="text-[11px] opacity-70" aria-hidden>
        ●
      </span>
    </span>
  ));
}

function ticker_copy({ text, hidden }: { text: string; hidden?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center whitespace-nowrap px-3 text-[13px] font-extrabold leading-9 sm:text-sm sm:leading-10"
      aria-hidden={hidden ? true : undefined}
    >
      {ticker_chunk(text)}
    </span>
  );
}

/** бегущая строка как у фарфора — над меню */
export default function news_ticker({ edit_mode = false, on_edit, embedded = false }: props) {
  const [settings, set_settings] = useState<news_ticker_settings>(default_news_ticker);

  useEffect(() => {
    function reload() {
      set_settings(get_news_ticker_settings());
    }
    reload();
    return subscribe_news_ticker_store(reload);
  }, []);

  const bar = (
    <div
      className="relative h-9 overflow-hidden rounded-[10px] sm:h-10"
      style={{ backgroundColor: settings.bg_color, color: settings.text_color }}
    >
      <div className="flex w-max flex-nowrap motion-reduce:animate-none animate-news-ticker hover:[animation-play-state:paused]">
        {ticker_copy({ text: settings.text })}
        {ticker_copy({ text: settings.text, hidden: true })}
      </div>
      {edit_mode && on_edit
        ? createElement(edit_pencil, {
            label: 'править бегущую строку',
            onClick: on_edit,
            className: embedded
              ? 'absolute top-1 right-1 z-20'
              : 'absolute top-1 right-[calc(var(--page-gutter)+4px)] z-20',
          })
        : null}
    </div>
  );

  if (embedded) return bar;

  return <div className="page-shell relative pb-3 min-[1024px]:pb-4">{bar}</div>;
}
