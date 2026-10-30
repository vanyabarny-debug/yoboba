import { type ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import { delimiter, join } from 'path';
import { clean_duration, clean_media_url } from '@/lib/radio-server';

const extra_dirs = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(process.env.HOME || '', '.local/bin'),
  join(process.env.HOME || '', '.pyenv/shims'),
];

const bin_cache = new Map<string, string>();

type capture = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: 'timeout' | 'abort' | 'missing' | 'spawn';
};

function child_env() {
  const path = [...extra_dirs, process.env.PATH || ''].filter(Boolean).join(delimiter);
  return { ...process.env, PATH: path };
}

function find_bin(name: string): Promise<string> {
  const cached = bin_cache.get(name);
  if (cached) return Promise.resolve(cached);
  const from_env = name === 'yt-dlp' ? process.env.YT_DLP_PATH : process.env.FFMPEG_PATH;
  if (from_env && existsSync(from_env)) {
    bin_cache.set(name, from_env);
    return Promise.resolve(from_env);
  }
  return new Promise((resolve) => {
    const probe = spawn('/usr/bin/which', [name], { env: child_env(), stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    probe.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    probe.on('close', () => {
      const found = stdout.trim().split('\n')[0];
      const hit =
        found ||
        extra_dirs.map((dir) => join(dir, name)).find((file) => existsSync(file)) ||
        name;
      bin_cache.set(name, hit);
      resolve(hit);
    });
    probe.on('error', () => {
      const hit = extra_dirs.map((dir) => join(dir, name)).find((file) => existsSync(file)) || name;
      bin_cache.set(name, hit);
      resolve(hit);
    });
  });
}

function auth_args() {
  const from_env = process.env.YT_DLP_COOKIES;
  if (from_env && existsSync(from_env)) return ['--cookies', from_env];
  const file = join(process.cwd(), 'data', 'yt-dlp-cookies.txt');
  if (existsSync(file)) return ['--cookies', file];
  const browser = process.env.YT_DLP_COOKIES_BROWSER || '';
  if (/^[a-z0-9:_-]+$/i.test(browser)) return ['--cookies-from-browser', browser];
  return [];
}

function kill_proc(proc: ChildProcess) {
  if (proc.exitCode !== null || proc.signalCode) return;
  proc.kill('SIGKILL');
}

function run_capture(bin: string, args: string[], timeout_ms: number, signal?: AbortSignal): Promise<capture> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const proc = spawn(bin, args, { env: child_env(), stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (result: capture) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', on_abort);
      resolve(result);
    };
    const timer = setTimeout(() => {
      kill_proc(proc);
      finish({ code: null, stdout, stderr, error: 'timeout' });
    }, timeout_ms);
    const on_abort = () => {
      kill_proc(proc);
      finish({ code: null, stdout, stderr, error: 'abort' });
    };
    if (signal?.aborted) {
      on_abort();
      return;
    }
    signal?.addEventListener('abort', on_abort, { once: true });
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 4_000_000) stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      finish({ code: null, stdout, stderr, error: err.code === 'ENOENT' ? 'missing' : 'spawn' });
    });
    proc.on('close', (code) => {
      finish({ code, stdout, stderr });
    });
  });
}

export function human_ytdlp_error(result: capture) {
  if (result.error === 'missing') return 'на сервере нет yt-dlp';
  if (result.error === 'timeout') return 'источник долго не отвечает';
  if (result.error === 'abort') return 'отменено';
  const text = result.stderr.trim();
  if (/not a bot|Sign in to confirm|cookies/i.test(text)) {
    return 'сайт не отдал ролик без входа. для youtube положите data/yt-dlp-cookies.txt';
  }
  const line = text
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .pop();
  const cleaned = (line || '').replace(/^ERROR:\s*/i, '').slice(0, 180);
  return cleaned || 'не получилось открыть ссылку';
}

export type radio_entry = { title: string; url: string; duration: number | null };

function pick_http(raw: string) {
  const parts = raw.split('\u001f');
  for (const part of parts) {
    const url = clean_media_url(part.trim());
    if (url) return url;
  }
  return null;
}

export async function list_source_entries(
  page_url: string,
  signal?: AbortSignal
): Promise<{ ok: true; entries: radio_entry[] } | { ok: false; error: string }> {
  const bin = await find_bin('yt-dlp');
  const result = await run_capture(
    bin,
    [
      '--flat-playlist',
      '--no-playlist',
      '--no-warnings',
      '--no-cache-dir',
      '--js-runtimes',
      'node',
      '--print',
      '%(title)s\u001f%(webpage_url)s\u001f%(url)s\u001f%(duration)s',
      ...auth_args(),
      page_url,
    ],
    45_000,
    signal
  );
  if (result.error === 'abort') return { ok: false, error: 'отменено' };
  const entries: radio_entry[] = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('\u001f');
    const title = (parts[0] || '').trim();
    const url = pick_http(parts.slice(1, 3).join('\u001f'));
    if (!url) continue;
    const label = !title || title === 'NA' ? 'ролик' : title.replace(/\s+/g, ' ').slice(0, 180);
    entries.push({ title: label, url, duration: clean_duration(parts[3]) });
    break;
  }
  if (!entries.length && result.code === 0) {
    const fallback = clean_media_url(page_url);
    if (fallback) entries.push({ title: 'ролик', url: fallback, duration: null });
  }
  if (!entries.length) return { ok: false, error: human_ytdlp_error(result) };
  return { ok: true, entries };
}

type dump_format = {
  url?: string;
  acodec?: string;
  vcodec?: string;
  http_headers?: Record<string, string>;
};

type dump_json = {
  url?: string;
  duration?: number;
  http_headers?: Record<string, string>;
  requested_formats?: dump_format[];
};

function ffmpeg_headers(raw: Record<string, string> | undefined) {
  if (!raw) return '';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) continue;
    if (/^accept-encoding$/i.test(key)) continue;
    lines.push(`${key}: ${value}`);
  }
  if (!lines.length) return '';
  return `${lines.join('\r\n')}\r\n`;
}

function youtube_id(page_url: string) {
  try {
    const url = new URL(page_url);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const watch = url.searchParams.get('v') || '';
      if (/^[\w-]{11}$/.test(watch)) return watch;
      const parts = url.pathname.split('/').filter(Boolean);
      const nested = parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' ? parts[1] || '' : '';
      return /^[\w-]{11}$/.test(nested) ? nested : null;
    }
  } catch {
    return null;
  }
  return null;
}

type piped_format = {
  url?: string;
  mimeType?: string;
  videoOnly?: boolean;
  itag?: number;
};

const piped_hosts = ['https://api.piped.private.coffee'];

async function piped_stream_target(video_id: string, signal?: AbortSignal) {
  for (const host of piped_hosts) {
    const timeout = AbortSignal.timeout(8000);
    const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(`${host}/streams/${video_id}`, {
        signal: stop,
        headers: { accept: 'application/json', 'user-agent': 'yoboba' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        duration?: number;
        audioStreams?: piped_format[];
        videoStreams?: piped_format[];
      };
      const rows = [...(data.audioStreams || []), ...(data.videoStreams || [])].filter(
        (row) => row.url && row.videoOnly !== true
      );
      const picked =
        rows.find((row) => (row.mimeType || '').startsWith('audio/')) ||
        rows.find((row) => row.itag === 18) ||
        rows[0];
      const media_url = clean_media_url(picked?.url);
      if (!media_url) continue;
      return { media_url, headers: '', duration: clean_duration(data.duration) };
    } catch {
      continue;
    }
  }
  return null;
}

function pick_media(data: dump_json) {
  const formats = data.requested_formats || [];
  const audio =
    formats.find((row) => row.url && row.acodec && row.acodec !== 'none' && (!row.vcodec || row.vcodec === 'none')) ||
    formats.find((row) => row.url);
  const url = clean_media_url(audio?.url) || clean_media_url(data.url);
  if (!url) return null;
  return { url, headers: ffmpeg_headers(audio?.http_headers || data.http_headers) };
}

export async function resolve_stream_target(
  page_url: string,
  signal?: AbortSignal
): Promise<{ ok: true; media_url: string; headers: string; duration: number | null } | { ok: false; error: string }> {
  const video_id = youtube_id(page_url);
  if (video_id) {
    const via_piped = await piped_stream_target(video_id, signal);
    if (via_piped) return { ok: true, ...via_piped };
  }
  const bin = await find_bin('yt-dlp');
  const result = await run_capture(
    bin,
    [
      '-f',
      'ba[acodec!=none]/ba/b',
      '--no-playlist',
      '--js-runtimes',
      'node',
      '--no-warnings',
      '--no-cache-dir',
      '-J',
      ...auth_args(),
      page_url,
    ],
    40_000,
    signal
  );
  if (result.code !== 0 || result.error) return { ok: false, error: human_ytdlp_error(result) };
  let data: dump_json;
  try {
    data = JSON.parse(result.stdout) as dump_json;
  } catch {
    return { ok: false, error: 'yt-dlp вернул не json' };
  }
  const media = pick_media(data);
  if (!media) return { ok: false, error: 'у ролика нет звука' };
  return { ok: true, media_url: media.url, headers: media.headers, duration: clean_duration(data.duration) };
}

export async function open_mp3_stream(media_url: string, headers: string, signal: AbortSignal, start_sec = 0) {
  const bin = await find_bin('ffmpeg');
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
  ];
  const start = Number.isFinite(start_sec) && start_sec > 0.2 ? Math.min(start_sec, 60 * 60 * 24) : 0;
  if (start > 0) args.push('-ss', start.toFixed(3));
  if (headers) args.push('-headers', headers);
  args.push('-i', media_url, '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '160k', '-f', 'mp3', 'pipe:1');

  const proc = spawn(bin, args, { env: child_env(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-500);
  });

  const kill = () => kill_proc(proc);
  const on_abort = () => kill();
  if (signal.aborted) kill();
  else signal.addEventListener('abort', on_abort, { once: true });

  const queued: Buffer[] = [];
  let mode: 'wait' | 'queue' | 'live' = 'wait';
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let failed: 'ffmpeg' | 'spawn' | null = null;

  const first = await new Promise<Buffer | null>((resolve) => {
    const timer = setTimeout(() => {
      kill();
      resolve(null);
    }, 30_000);
    const done = (chunk: Buffer | null) => {
      clearTimeout(timer);
      resolve(chunk);
    };
    proc.stdout?.on('data', (chunk: Buffer) => {
      if (mode === 'wait') {
        mode = 'queue';
        done(chunk);
        return;
      }
      if (mode === 'queue') queued.push(chunk);
      else {
        try {
          controller?.enqueue(new Uint8Array(chunk));
        } catch {
          kill();
        }
      }
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      failed = err.code === 'ENOENT' ? 'ffmpeg' : 'spawn';
      done(null);
    });
    proc.on('close', () => {
      if (mode === 'wait') done(null);
      else {
        try {
          controller?.close();
        } catch {
          /* поток уже закрыт */
        }
      }
    });
  });

  if (!first || failed) {
    kill();
    signal.removeEventListener('abort', on_abort);
    if (!first && stderr) console.error('radio stream', stderr.slice(-300));
    const error = failed === 'ffmpeg' ? 'на сервере нет ffmpeg' : 'не удалось включить поток';
    return new Response(JSON.stringify({ error }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      ctrl.enqueue(new Uint8Array(first));
      for (const chunk of queued) ctrl.enqueue(new Uint8Array(chunk));
      queued.length = 0;
      mode = 'live';
      if (proc.exitCode !== null) {
        try {
          ctrl.close();
        } catch {
          /* уже закрыт */
        }
      }
    },
    cancel() {
      kill();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
