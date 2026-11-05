import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

export type radio_track = {
  id: string;
  url: string;
  title: string;
  /** длина ролика, секунды; null — ещё не известна */
  duration: number | null;
  /** загружен файлом, url тогда вида file:имя */
  source?: 'file';
};

export type radio_source = {
  tracks: radio_track[];
};

export const radio_track_limit = 80;

function empty_source(): radio_source {
  return { tracks: [] };
}

function is_private_host(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1') return true;
  const parts = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!parts) return false;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** только публичные http(s), без аргументов для yt-dlp и без локальной сети */
export function clean_media_url(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 8000 || text.startsWith('-') || /[\s\u0000]/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname || is_private_host(url.hostname)) return null;
  return url.toString();
}

export function clean_duration(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 60 * 60 * 24) return null;
  return Math.round(n * 10) / 10;
}

function clean_title(raw: unknown) {
  if (typeof raw !== 'string') return 'ролик';
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title || title === 'NA') return 'ролик';
  return title.slice(0, 180);
}

export function file_track_url(name: string) {
  return `file:${name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 240) || 'запись'}`;
}

function clean_track(raw: unknown): radio_track | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<radio_track>;
  const is_file = row.source === 'file';
  const url = is_file
    ? typeof row.url === 'string' && row.url.startsWith('file:')
      ? file_track_url(row.url.slice(5))
      : null
    : clean_media_url(row.url);
  if (!url || typeof row.id !== 'string' || !row.id.trim()) return null;
  return {
    id: row.id.trim().slice(0, 80),
    url,
    title: clean_title(row.title),
    duration: clean_duration(row.duration),
    ...(is_file ? { source: 'file' as const } : {}),
  };
}

export function new_track_id() {
  return `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const radio_key = 'radio';
const radio_file = join(process.cwd(), 'data', `${radio_key}.json`);

function normalize_source(raw: unknown): radio_source {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as radio_source).tracks)) return empty_source();
  const tracks: radio_track[] = [];
  for (const row of (raw as radio_source).tracks) {
    const track = clean_track(row);
    if (track) tracks.push(track);
    if (tracks.length >= radio_track_limit) break;
  }
  return { tracks };
}

async function radio_kv() {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv | undefined)?.YOBOBA_DATA ?? null;
  } catch {
    return null;
  }
}

function read_radio_file(): radio_source {
  if (!existsSync(radio_file)) return empty_source();
  try {
    return normalize_source(JSON.parse(readFileSync(radio_file, 'utf-8')));
  } catch {
    return empty_source();
  }
}

function write_radio_file(source: radio_source) {
  const dir = join(process.cwd(), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.radio.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, JSON.stringify(source, null, 2), 'utf-8');
  try {
    renameSync(tmp, radio_file);
  } catch {
    try {
      unlinkSync(radio_file);
    } catch {
      /* файла ещё нет */
    }
    renameSync(tmp, radio_file);
  }
}

/** KV в проде, файл на диске локально. Контекст Cloudflare без KV файл не прячет. */
export async function read_radio(): Promise<radio_source> {
  const kv = await radio_kv();
  if (kv) {
    const raw = await kv.get(radio_key);
    if (!raw) return empty_source();
    try {
      return normalize_source(JSON.parse(raw));
    } catch {
      return empty_source();
    }
  }
  return read_radio_file();
}

export async function write_radio(source: radio_source) {
  const tracks = source.tracks.slice(0, radio_track_limit);
  const next = { tracks };
  const kv = await radio_kv();
  if (kv) {
    await kv.put(radio_key, JSON.stringify(next));
    return next;
  }
  write_radio_file(next);
  return next;
}
