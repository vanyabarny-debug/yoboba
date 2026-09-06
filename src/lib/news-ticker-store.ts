export const news_ticker_store_version = 1;

const storage_key = 'yoboba_news_ticker_store';
const update_event = 'yoboba-news-ticker-update';

export type news_ticker_settings = {
  text: string;
  bg_color: string;
  text_color: string;
};

export const default_news_ticker: news_ticker_settings = {
  text: 'скоро открытие',
  bg_color: '#ffe14d',
  text_color: '#171717',
};

export const NEWS_TICKER_BG_PRESETS = [
  '#ffe14d',
  '#ff6b6b',
  '#f9bac2',
  '#002d7a',
  '#171717',
  '#ffffff',
] as const;

export const NEWS_TICKER_TEXT_PRESETS = [
  '#171717',
  '#ffffff',
  '#ff6b6b',
  '#002d7a',
  '#ffe14d',
] as const;

type news_ticker_store = {
  version: number;
  settings: news_ticker_settings;
};

function emit_update() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(update_event));
  }
}

function normalize_hex(raw?: string | null, fallback = '#171717'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const h = trimmed.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function normalize_news_ticker(
  partial?: Partial<news_ticker_settings> | null
): news_ticker_settings {
  const text = (partial?.text ?? default_news_ticker.text).trim() || default_news_ticker.text;
  return {
    text,
    bg_color: normalize_hex(partial?.bg_color, default_news_ticker.bg_color),
    text_color: normalize_hex(partial?.text_color, default_news_ticker.text_color),
  };
}

export function get_default_news_ticker_store(): news_ticker_store {
  return {
    version: news_ticker_store_version,
    settings: { ...default_news_ticker },
  };
}

export function get_news_ticker_store(): news_ticker_store {
  if (typeof window === 'undefined') return get_default_news_ticker_store();
  const raw = localStorage.getItem(storage_key);
  const seed = get_default_news_ticker_store();
  if (!raw) {
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as news_ticker_store;
    const next: news_ticker_store = {
      version: news_ticker_store_version,
      settings: normalize_news_ticker(parsed.settings),
    };
    if (
      parsed.version !== next.version ||
      JSON.stringify(parsed.settings) !== JSON.stringify(next.settings)
    ) {
      localStorage.setItem(storage_key, JSON.stringify(next));
    }
    return next;
  } catch {
    localStorage.setItem(storage_key, JSON.stringify(seed));
    return seed;
  }
}

export function get_news_ticker_settings(): news_ticker_settings {
  return get_news_ticker_store().settings;
}

function write_local(settings: news_ticker_settings) {
  const next: news_ticker_store = {
    version: news_ticker_store_version,
    settings: normalize_news_ticker(settings),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(storage_key, JSON.stringify(next));
  }
  emit_update();
  return next.settings;
}

export function publish_news_ticker_now(settings: news_ticker_settings = get_news_ticker_settings()) {
  if (typeof window === 'undefined') return;
  void fetch('/api/admin/news-ticker', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(normalize_news_ticker(settings)),
  });
}

/** тянет актуальный текст с сервера — для всех устройств */
export function hydrate_news_ticker_from_server(): Promise<news_ticker_settings> {
  if (typeof window === 'undefined') {
    return Promise.resolve(get_news_ticker_settings());
  }
  return fetch('/api/news-ticker', { cache: 'no-store' })
    .then((r) => r.json())
    .then((body: { settings?: Partial<news_ticker_settings> | null }) => {
      if (!body?.settings) return get_news_ticker_settings();
      return write_local(normalize_news_ticker(body.settings));
    })
    .catch(() => get_news_ticker_settings());
}

export function save_news_ticker_settings(settings: news_ticker_settings) {
  const next = write_local(settings);
  publish_news_ticker_now(next);
  return next;
}

export function reset_news_ticker_settings() {
  return save_news_ticker_settings(default_news_ticker);
}

export function subscribe_news_ticker_store(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(update_event, cb);
  return () => window.removeEventListener(update_event, cb);
}
