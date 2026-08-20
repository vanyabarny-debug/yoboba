'use client';

const ticker_text = 'скоро открытие';
const ticker_repeat = 12;

function ticker_chunk() {
  return Array.from({ length: ticker_repeat }, (_, i) => (
    <span
      key={i}
      className="inline-flex shrink-0 items-center gap-4 pr-4 sm:gap-5 sm:pr-5"
    >
      <span>{ticker_text}</span>
      <span className="text-[11px] opacity-70" aria-hidden>
        ●
      </span>
    </span>
  ));
}

function ticker_copy({ hidden }: { hidden?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center whitespace-nowrap px-3 text-[13px] font-extrabold leading-9 sm:text-sm sm:leading-10"
      aria-hidden={hidden ? true : undefined}
    >
      {ticker_chunk()}
    </span>
  );
}

/** бегущая строка как у фарфора — над меню */
export default function news_ticker() {
  return (
    <div className="page-shell pb-3 min-[1024px]:pb-4">
      <div className="h-9 overflow-hidden rounded-[10px] bg-[#ffe14d] text-neutral-900 sm:h-10">
        <div className="flex w-max flex-nowrap motion-reduce:animate-none animate-news-ticker hover:[animation-play-state:paused]">
          {ticker_copy({})}
          {ticker_copy({ hidden: true })}
        </div>
      </div>
    </div>
  );
}
