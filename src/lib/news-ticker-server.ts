import { read_json_store, write_json_store } from '@/lib/data-store';
import {
  default_news_ticker,
  normalize_news_ticker,
  type news_ticker_settings,
} from '@/lib/news-ticker-store';

const store_key = 'news-ticker';

export async function read_published_news_ticker(): Promise<news_ticker_settings> {
  const raw = await read_json_store<Partial<news_ticker_settings> | null>(store_key, null);
  if (!raw) return { ...default_news_ticker };
  return normalize_news_ticker(raw);
}

export async function write_published_news_ticker(
  settings: news_ticker_settings
): Promise<news_ticker_settings> {
  const next = normalize_news_ticker(settings);
  await write_json_store(store_key, next);
  return next;
}
