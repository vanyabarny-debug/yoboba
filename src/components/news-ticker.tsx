'use client';

const ticker_text = 'скоро открытие';
const ticker_repeat = 12;

function ticker_chunk() {
  return Array.from({ length: ticker_repeat }, (_, i) => (
    <span key={i} className="inline-flex items-center gap-4 sm:gap-5 pr-4 sm:pr-5">
      <span>{ticker_text}</span>
      <span className="text-[11px] opacity-70" aria-hidden>
        ●
      </span>
    </span>
  ));
}

/** бегущая строка как у фарфора — над меню */
export default function news_ticker() {
  return (
    <div className="page-shell pb-3 min-[1024px]:pb-4">
      <div className="news-ticker overflow-hidden rounded-[10px] bg-[#ffe14d] text-neutral-900">
        <div className="news-ticker-track">
          <p className="news-ticker-copy">{ticker_chunk()}</p>
          <p className="news-ticker-copy" aria-hidden>
            {ticker_chunk()}
          </p>
        </div>
      </div>
    </div>
  );
}
