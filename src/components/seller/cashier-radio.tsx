'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { forget_other_radio, peek_radio_blob, pull_radio_file } from '@/lib/radio-device';
import { spot_is_open } from '@/lib/spot-store';
import type { spot_hours } from '@/lib/types';

type radio_track = { id: string; title: string; duration: number | null; bytes?: number };
type play_mode = 'stopped' | 'playing' | 'paused';

const skip_sec = 15;
const nag_first_ms = 12_000;
const nag_every_ms = 22_000;
const idle = { bg: '#EEF0FF', fg: '#3D4DB7', border: '#D0D6FF' };
const live = { bg: '#FFE8E8', fg: '#D64545', border: '#FFC9C9' };

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const whole = Math.floor(sec);
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function nag_beep(ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes: [number, number][] = [
    [0, 880],
    [0.16, 1174],
  ];
  for (const [at, freq] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.07, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.14);
  }
}

function icon_play() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16" aria-hidden>
      <path d="M8 5.2v13.6l11.2-6.8L8 5.2Z" fill="currentColor" />
    </svg>
  );
}

function icon_pause() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16" aria-hidden>
      <rect x="6" y="5" width="3.4" height="14" fill="currentColor" />
      <rect x="14.6" y="5" width="3.4" height="14" fill="currentColor" />
    </svg>
  );
}

function floating_title({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [drift, set_drift] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const sample = el.querySelector('[data-title]') as HTMLElement | null;
      set_drift(Boolean(sample && sample.scrollWidth > el.clientWidth + 1));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [text]);

  if (!text) return null;
  return (
    <div ref={box} className="mb-0.5 h-[13px] overflow-hidden text-left text-[9px] font-semibold leading-[13px]">
      {drift ? (
        <div className="radio-drift">
          <span data-title className="shrink-0 whitespace-nowrap">
            {text}
          </span>
          <span className="shrink-0 whitespace-nowrap" aria-hidden>
            {text}
          </span>
        </div>
      ) : (
        <span data-title className="inline-block whitespace-nowrap">
          {text}
        </span>
      )}
    </div>
  );
}

function icon_skip({ dir }: { dir: 'back' | 'forward' }) {
  const triangle =
    dir === 'back'
      ? 'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z'
      : 'M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z';
  const bar = dir === 'back' ? 4 : 20;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path d={triangle} fill="currentColor" />
      <path d={`M${bar} 5v14`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function cashier_radio({ hours }: { hours?: spot_hours | null }) {
  const audio_ref = useRef<HTMLAudioElement | null>(null);
  const tracks_ref = useRef<radio_track[]>([]);
  const index_ref = useRef(0);
  const target_ref = useRef(0);
  const mode_ref = useRef<play_mode>('stopped');
  const scrub_ref = useRef(false);
  const gen_ref = useRef(0);
  const warm_gen = useRef(0);
  const blob_url = useRef('');
  const stop_ref = useRef<AbortController | null>(null);
  const load_failed = useRef(false);
  const hours_ref = useRef(hours ?? null);
  const nag_ctx = useRef<AudioContext | null>(null);
  const [mode, set_mode] = useState<play_mode>('stopped');
  const [shown, set_shown] = useState(0);
  const [duration, set_duration] = useState(0);
  const [error, set_error] = useState('');
  const [hint, set_hint] = useState('');
  const [title, set_title] = useState('');
  const duration_ref = useRef(0);
  hours_ref.current = hours ?? null;

  function remember_duration(tracks: radio_track[], index = index_ref.current) {
    const track = tracks[index];
    const next = track?.duration && track.duration > 0 ? track.duration : 0;
    duration_ref.current = next;
    set_duration(next);
    set_title(track?.title?.trim() || '');
  }

  function arm_sound() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!nag_ctx.current) nag_ctx.current = new Ctx();
    if (nag_ctx.current.state === 'suspended') void nag_ctx.current.resume();
  }

  async function load_tracks() {
    try {
      const res = await fetch('/api/seller/radio', { credentials: 'same-origin' });
      if (!res.ok) {
        load_failed.current = true;
        return tracks_ref.current;
      }
      const data = (await res.json()) as { tracks?: radio_track[] };
      const tracks = Array.isArray(data.tracks)
        ? data.tracks.filter((track) => track && typeof track.id === 'string')
        : [];
      tracks_ref.current = tracks;
      load_failed.current = false;
      remember_duration(tracks);
      return tracks;
    } catch {
      load_failed.current = true;
      return tracks_ref.current;
    }
  }

  useEffect(() => {
    const stop = new AbortController();
    stop_ref.current = stop;
    const warm = (tracks: radio_track[]) => {
      const my = ++warm_gen.current;
      void (async () => {
        await forget_other_radio(tracks.map((track) => track.id)).catch(() => {});
        for (const track of tracks) {
          if (stop.signal.aborted || warm_gen.current !== my) return;
          const timer = window.setTimeout(() => {
            if (warm_gen.current === my) set_hint('качаю на устройство');
          }, 400);
          try {
            await pull_radio_file(track.id, track.bytes || 0, false, stop.signal);
          } catch (err) {
            if (stop.signal.aborted || warm_gen.current !== my) return;
            if (err instanceof DOMException && err.name === 'AbortError') return;
            set_error(err instanceof Error && err.message ? err.message : 'не скачалось');
          } finally {
            window.clearTimeout(timer);
            if (!stop.signal.aborted && warm_gen.current === my) set_hint('');
          }
        }
      })();
    };
    void load_tracks().then((tracks) => {
      if (!stop.signal.aborted) warm(tracks);
    });
    function on_visible() {
      if (document.visibilityState !== 'visible') return;
      void load_tracks().then((tracks) => {
        if (!stop.signal.aborted) warm(tracks);
      });
    }
    document.addEventListener('visibilitychange', on_visible);
    return () => {
      mode_ref.current = 'stopped';
      stop.abort();
      document.removeEventListener('visibilitychange', on_visible);
      if (blob_url.current) URL.revokeObjectURL(blob_url.current);
      blob_url.current = '';
      const audio = audio_ref.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.dataset.track = '';
    };
  }, []);

  useEffect(() => {
    if (mode === 'playing') return;
    let timer = 0;
    let stopped = false;
    const tick = () => {
      if (stopped || mode_ref.current === 'playing') return;
      if (!tracks_ref.current.length || !spot_is_open(hours_ref.current)) return;
      const ctx = nag_ctx.current;
      if (ctx && ctx.state === 'running') nag_beep(ctx);
    };
    timer = window.setTimeout(function loop() {
      tick();
      if (stopped) return;
      timer = window.setTimeout(loop, nag_every_ms);
    }, nag_first_ms);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [mode, hours]);

  function begin(my: number) {
    const audio = audio_ref.current;
    if (!audio || gen_ref.current !== my || mode_ref.current !== 'playing') return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      duration_ref.current = audio.duration;
      set_duration(audio.duration);
    }
    const length = duration_ref.current;
    const at = length ? Math.min(Math.max(0, target_ref.current), length) : Math.max(0, target_ref.current);
    try {
      if (Math.abs((audio.currentTime || 0) - at) > 0.35) audio.currentTime = at;
    } catch {
      /* позиция встанет, когда метаданные будут готовы */
    }
    set_shown(at);
    void audio.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (gen_ref.current !== my || mode_ref.current !== 'playing') return;
      mode_ref.current = 'stopped';
      set_mode('stopped');
      set_error('нажмите ещё раз');
    });
  }

  async function play_from(at: number, retry: boolean) {
    const tracks = tracks_ref.current;
    const audio = audio_ref.current;
    if (!audio || !tracks.length) return;
    const index = ((index_ref.current % tracks.length) + tracks.length) % tracks.length;
    index_ref.current = index;
    const track = tracks[index];
    remember_duration(tracks, index);
    target_ref.current = at;
    const my = ++gen_ref.current;
    const wait = window.setTimeout(() => {
      if (gen_ref.current === my && mode_ref.current === 'playing') set_error('качаю на устройство');
    }, 400);
    try {
      const blob = await pull_radio_file(track.id, track.bytes || 0, retry, stop_ref.current?.signal);
      if (gen_ref.current !== my || mode_ref.current !== 'playing') return;
      set_error('');
      const same = audio.dataset.track === track.id && Boolean(audio.src);
      if (!same) {
        if (blob_url.current) URL.revokeObjectURL(blob_url.current);
        const url = URL.createObjectURL(blob);
        blob_url.current = url;
        audio.dataset.track = track.id;
        audio.addEventListener('loadedmetadata', () => begin(my), { once: true });
        audio.src = url;
        return;
      }
      begin(my);
    } catch (err) {
      if (gen_ref.current !== my || mode_ref.current !== 'playing') return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      mode_ref.current = 'stopped';
      set_mode('stopped');
      set_error(err instanceof Error && err.message ? err.message : 'не скачалось');
    } finally {
      window.clearTimeout(wait);
    }
  }

  function play_now(at: number) {
    const audio = audio_ref.current;
    if (!audio) return;
    target_ref.current = at;
    const my = ++gen_ref.current;
    if (audio.readyState >= 1) begin(my);
    else audio.addEventListener('loadedmetadata', () => begin(my), { once: true });
    void audio.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (gen_ref.current !== my || mode_ref.current !== 'playing') return;
      mode_ref.current = 'stopped';
      set_mode('stopped');
      set_error('нажмите ещё раз');
    });
  }

  function press_play() {
    arm_sound();
    set_error('');
    const audio = audio_ref.current;
    if (mode_ref.current === 'playing') {
      mode_ref.current = 'paused';
      set_mode('paused');
      audio?.pause();
      return;
    }
    const track = tracks_ref.current[index_ref.current];
    if (audio && track && audio.dataset.track === track.id && audio.getAttribute('src')) {
      mode_ref.current = 'playing';
      set_mode('playing');
      play_now(audio.currentTime || target_ref.current);
      return;
    }
    const hot = track ? peek_radio_blob(track.id, track.bytes || 0) : null;
    if (audio && track && hot) {
      mode_ref.current = 'playing';
      set_mode('playing');
      if (blob_url.current) URL.revokeObjectURL(blob_url.current);
      const url = URL.createObjectURL(hot);
      blob_url.current = url;
      audio.dataset.track = track.id;
      audio.src = url;
      play_now(target_ref.current);
      return;
    }
    const go = (tracks: radio_track[]) => {
      if (!tracks.length) {
        set_error(load_failed.current ? 'не загрузилось' : 'нет ссылок');
        return;
      }
      mode_ref.current = 'playing';
      set_mode('playing');
      void play_from(target_ref.current, true);
    };
    if (tracks_ref.current.length) {
      go(tracks_ref.current);
      void load_tracks();
      return;
    }
    void load_tracks().then(go);
  }

  function seek(seconds: number) {
    const length = duration_ref.current;
    const at = length ? Math.min(Math.max(0, seconds), length) : Math.max(0, seconds);
    target_ref.current = at;
    set_shown(at);
    if (mode_ref.current === 'stopped') return;
    const audio = audio_ref.current;
    const track = tracks_ref.current[index_ref.current];
    if (audio && track && audio.dataset.track === track.id && audio.readyState >= 1) {
      try {
        audio.currentTime = at;
      } catch {
        /* файл ещё открывается, позиция уже записана */
      }
    }
  }

  function skip(dir: -1 | 1) {
    arm_sound();
    const length = duration_ref.current;
    const at = shown + dir * skip_sec;
    if (dir < 0 && shown < 1) return;
    if (dir > 0 && length && shown >= length - 1) return;
    seek(at);
  }

  function next_track() {
    const tracks = tracks_ref.current;
    if (!tracks.length) return;
    index_ref.current = (index_ref.current + 1) % tracks.length;
    void play_from(0, false);
  }

  function on_meta() {
    const audio = audio_ref.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    duration_ref.current = audio.duration;
    set_duration(audio.duration);
  }

  function on_time() {
    if (scrub_ref.current || mode_ref.current === 'stopped') return;
    const audio = audio_ref.current;
    if (!audio) return;
    const at = audio.currentTime || 0;
    target_ref.current = at;
    set_shown(at);
  }

  function on_ended() {
    if (mode_ref.current !== 'playing') return;
    const audio = audio_ref.current;
    const length = audio?.duration || 0;
    const at = audio?.currentTime || 0;
    if (!Number.isFinite(length) || length < 1 || at < length - 1.5) return;
    next_track();
  }

  function on_audio_error() {
    const audio = audio_ref.current;
    if (mode_ref.current !== 'playing' || !audio) return;
    if (audio.error?.code === 1) return;
    mode_ref.current = 'stopped';
    set_mode('stopped');
    set_error('запись не открылась');
  }

  const max = duration > 0 ? duration : 0;
  const knob = max ? Math.min(shown, max) : 0;
  const can_back = shown >= 1;
  const can_forward = !max || shown < max - 1;
  const tone = mode === 'playing' ? live : idle;
  const arrow = (on: boolean) =>
    `grid h-10 w-10 appearance-none place-items-center rounded-full border-0 bg-transparent shadow-none disabled:bg-transparent ${on ? 'text-current' : 'text-current/35'}`;

  return (
    <article
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border"
      style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg }}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center gap-1 px-2">
        <button
          type="button"
          aria-label="назад"
          disabled={!can_back}
          onClick={() => skip(-1)}
          className={arrow(can_back)}
        >
          {icon_skip({ dir: 'back' })}
        </button>
        <button type="button" aria-label={mode === 'playing' ? 'пауза' : 'воспроизведение'} onClick={press_play} className="text-current">
          {mode === 'playing' ? icon_pause() : icon_play()}
        </button>
        <button
          type="button"
          aria-label="вперёд"
          disabled={!can_forward}
          onClick={() => skip(1)}
          className={arrow(can_forward)}
        >
          {icon_skip({ dir: 'forward' })}
        </button>
      </div>
      <div className="shrink-0 px-2.5 pb-2">
        {createElement(floating_title, { text: title })}
        {error || hint ? <p className="mb-1 truncate text-left text-[10px] opacity-70">{error || hint}</p> : null}
        <input
          type="range"
          min={0}
          max={max || 0}
          step={0.1}
          value={knob}
          disabled={!max}
          aria-label="время"
          className="radio-line h-2.5 w-full cursor-pointer disabled:opacity-40"
          style={{ ['--line' as string]: max ? `${(knob / max) * 100}%` : '0%' }}
          onPointerDown={() => {
            scrub_ref.current = true;
          }}
          onInput={(event) => set_shown(Number(event.currentTarget.value))}
          onPointerUp={(event) => {
            scrub_ref.current = false;
            seek(Number(event.currentTarget.value));
          }}
          onKeyUp={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
              return;
            }
            seek(Number(event.currentTarget.value));
          }}
          onBlur={() => {
            scrub_ref.current = false;
          }}
        />
        <div className="mt-0.5 flex items-center justify-between text-[9px] tabular-nums opacity-70">
          <span>{clock(shown)}</span>
          <span>{max ? clock(max) : '–:–'}</span>
        </div>
      </div>
      <audio
        ref={audio_ref}
        hidden
        preload="auto"
        onLoadedMetadata={on_meta}
        onTimeUpdate={on_time}
        onPlaying={on_time}
        onEnded={on_ended}
        onError={on_audio_error}
      />
      <style>{`
        .radio-line {
          appearance: none;
          background: transparent;
        }
        .radio-line::-webkit-slider-runnable-track {
          height: 1.6px;
          border-radius: 999px;
          background: linear-gradient(to right, currentColor var(--line, 0%), color-mix(in srgb, currentColor 28%, transparent) var(--line, 0%));
        }
        .radio-line::-webkit-slider-thumb {
          appearance: none;
          width: 6px;
          height: 6px;
          margin-top: -2.2px;
          border-radius: 999px;
          background: currentColor;
        }
        .radio-line::-moz-range-track {
          height: 1.6px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(to right, currentColor var(--line, 0%), color-mix(in srgb, currentColor 28%, transparent) var(--line, 0%));
        }
        .radio-line::-moz-range-thumb {
          width: 6px;
          height: 6px;
          border: 0;
          border-radius: 999px;
          background: currentColor;
        }
        @keyframes radio-drift {
          0%, 12% { transform: translateX(0); }
          100% { transform: translateX(calc(-50% - 1.25rem)); }
        }
        .radio-drift {
          display: inline-flex;
          width: max-content;
          gap: 2.5rem;
          animation: radio-drift 24s linear infinite;
        }
      `}</style>
    </article>
  );
}
