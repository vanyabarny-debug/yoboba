import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { convert_upload_mp3, download_source_mp3 } from '@/lib/radio-ytdlp';
import { read_radio, write_radio, type radio_track } from '@/lib/radio-server';

type job = { state: 'running' } | { state: 'failed'; error: string };

const jobs = new Map<string, job>();
const controllers = new Map<string, AbortController>();

export function radio_cache_dir() {
  return join(process.cwd(), 'data', 'radio-cache');
}

export function safe_track_id(id: string) {
  return /^track-[a-z0-9-]{4,72}$/i.test(id) ? id : null;
}

export function radio_mp3_path(id: string) {
  const safe = safe_track_id(id);
  if (!safe) return null;
  return join(radio_cache_dir(), `${safe}.mp3`);
}

/** загруженный исходник лежит рядом, пока не станет mp3 */
export function radio_src_path(id: string) {
  const safe = safe_track_id(id);
  if (!safe) return null;
  return join(radio_cache_dir(), `${safe}.src`);
}

export function radio_upload_path(id: string) {
  const safe = safe_track_id(id);
  if (!safe) return null;
  return join(radio_cache_dir(), `${safe}.upload`);
}

export function radio_mp3_bytes(id: string) {
  const path = radio_mp3_path(id);
  if (!path || !existsSync(path)) return 0;
  try {
    const size = statSync(path).size;
    return size > 200_000 ? size : 0;
  } catch {
    return 0;
  }
}

function radio_mp3_ready(id: string) {
  return radio_mp3_bytes(id) > 0;
}

async function finish_job(track: radio_track, signal: AbortSignal) {
  const path = radio_mp3_path(track.id);
  try {
    if (!path) {
      jobs.set(track.id, { state: 'failed', error: 'плохой id' });
      return;
    }
    mkdirSync(radio_cache_dir(), { recursive: true });
    const src = track.source === 'file' ? radio_src_path(track.id) : null;
    if (track.source === 'file' && (!src || !existsSync(src))) {
      jobs.set(track.id, { state: 'failed', error: 'файл потерялся — загрузите заново' });
      return;
    }
    const result = src
      ? await convert_upload_mp3(src, path, signal)
      : await download_source_mp3(track.url, path, signal);
    if (src && result.ok) rmSync(src, { force: true });
    if (signal.aborted) {
      jobs.delete(track.id);
      return;
    }
    if (!result.ok) {
      console.error('radio cache', result.error);
      jobs.set(track.id, { state: 'failed', error: result.error });
      return;
    }
    if (result.duration && track.duration && result.duration < track.duration * 0.8) {
      rmSync(path, { force: true });
      jobs.set(track.id, { state: 'failed', error: 'файл скачался не целиком' });
      return;
    }
    jobs.delete(track.id);
    if (result.duration && result.duration !== track.duration) {
      const source = await read_radio();
      const same = source.tracks.some((item) => item.id === track.id && item.duration === result.duration);
      if (!same) {
        await write_radio({
          tracks: source.tracks.map((item) => (item.id === track.id ? { ...item, duration: result.duration } : item)),
        });
      }
    }
  } finally {
    controllers.delete(track.id);
  }
}

function begin(track: radio_track) {
  if (jobs.get(track.id)?.state === 'running') return;
  const controller = new AbortController();
  controllers.set(track.id, controller);
  jobs.set(track.id, { state: 'running' });
  void finish_job(track, controller.signal);
}

export function kick_radio_file(track: radio_track, retry: boolean) {
  if (radio_mp3_ready(track.id)) return 'ready' as const;
  const job = jobs.get(track.id);
  if (job?.state === 'running') return 'preparing' as const;
  if (job?.state === 'failed' && !retry) return 'failed' as const;
  jobs.delete(track.id);
  begin(track);
  return 'preparing' as const;
}

export function radio_file_error(id: string) {
  const job = jobs.get(id);
  return job?.state === 'failed' ? job.error : 'не скачалось';
}

export function discard_radio_file(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
  jobs.delete(id);
  const path = radio_mp3_path(id);
  if (!path) return;
  rmSync(path, { force: true });
  rmSync(`${path}.part`, { force: true });
  rmSync(`${path}.work`, { recursive: true, force: true });
  for (const extra of [radio_src_path(id), radio_upload_path(id)]) {
    if (extra) rmSync(extra, { force: true });
  }
}

export function radio_file_response(id: string) {
  const path = radio_mp3_path(id);
  if (!path || !radio_mp3_ready(id)) return null;
  const size = statSync(path).size;
  const node = createReadStream(path);
  const stream = Readable.toWeb(node) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': String(size),
      'cache-control': 'private, max-age=31536000, no-transform',
      'x-content-type-options': 'nosniff',
    },
  });
}
