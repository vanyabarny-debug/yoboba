'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { spot_is_open } from '@/lib/spot-store';
import type { spot_hours } from '@/lib/types';

type radio_track = { id: string; title: string; duration: number | null };
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
  const origin_ref = useRef(0);
  const mode_ref = useRef<play_mode>('stopped');
  const scrub_ref = useRef(false);
  const gen_ref = useRef(0);
  const fail_ref = useRef(0);
  const drops_ref = useRef(0);
  const live_ref = useRef(false);
  const heard_ref = useRef(0);
  const resume_lock_ref = useRef(0);
  const load_failed = useRef(false);
  const hours_ref = useRef(hours ?? null);
  const nag_ctx = useRef<AudioContext | null>(null);
  const [mode, set_mode] = useState<play_mode>('stopped');
  const [shown, set_shown] = useState(0);
  const [duration, set_duration] = useState(0);
  const [error, set_error] = useState('');
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
    void load_tracks();
    function on_visible() {
      if (document.visibilityState === 'visible' && mode_ref.current === 'stopped') void load_tracks();
    }
    document.addEventListener('visibilitychange', on_visible);
    return () => {
      mode_ref.current = 'stopped';
      document.removeEventListener('visibilitychange', on_visible);
      const audio = audio_ref.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
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

  function start_stream(at: number) {
    const tracks = tracks_ref.current;
    const audio = audio_ref.current;
    if (!audio || !tracks.length) return;
    const index = ((index_ref.current % tracks.length) + tracks.length) % tracks.length;
    index_ref.current = index;
    const track = tracks[index];
    const length = track.duration && track.duration > 0 ? track.duration : duration_ref.current;
    const begin = length ? Math.min(Math.max(0, at), Math.max(0, length - 0.4)) : Math.max(0, at);
    origin_ref.current = begin;
    heard_ref.current = begin;
    set_shown(begin);
    remember_duration(tracks, index);
    live_ref.current = false;
    const my = ++gen_ref.current;
    const query = new URLSearchParams({ id: track.id, start: String(begin) });
    audio.src = `/api/seller/radio/stream?${query}`;
    const started = audio.play();
    if (!started) return;
    void started.catch(() => {
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
    if (mode_ref.current === 'paused' && audio?.getAttribute('src')) {
      mode_ref.current = 'playing';
      set_mode('playing');
      void audio.play().catch(() => {
        start_stream(origin_ref.current);
      });
      return;
    }
    const go = (tracks: radio_track[]) => {
      if (!tracks.length) {
        set_error(load_failed.current ? 'не загрузилось' : 'нет ссылок');
        return;
      }
      mode_ref.current = 'playing';
      set_mode('playing');
      fail_ref.current = 0;
      drops_ref.current = 0;
      start_stream(origin_ref.current);
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
    origin_ref.current = at;
    set_shown(at);
    if (mode_ref.current === 'stopped') return;
    if (mode_ref.current === 'paused') {
      const audio = audio_ref.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    start_stream(at);
  }

  function skip(dir: -1 | 1) {
    arm_sound();
    const length = duration_ref.current;
    const at = shown + dir * skip_sec;
    if (dir < 0 && shown < 1) return;
    if (dir > 0 && length && shown >= length - 1) return;
    seek(at);
  }

  function place() {
    const audio = audio_ref.current;
    return Math.max(heard_ref.current, origin_ref.current + (audio?.currentTime || 0));
  }

  function same_song(at: number) {
    const length = duration_ref.current;
    return length > 20 && at > 1 && at < length - 8;
  }

  function hold_song(at: number) {
    const now = Date.now();
    if (now - resume_lock_ref.current < 700) return true;
    if (drops_ref.current >= 6) return false;
    resume_lock_ref.current = now;
    drops_ref.current += 1;
    start_stream(at);
    return true;
  }

  function next_track() {
    const tracks = tracks_ref.current;
    if (!tracks.length) return;
    drops_ref.current = 0;
    fail_ref.current = 0;
    index_ref.current = (index_ref.current + 1) % tracks.length;
    origin_ref.current = 0;
    start_stream(0);
  }

  function on_time() {
    if (scrub_ref.current || mode_ref.current === 'stopped') return;
    const audio = audio_ref.current;
    if (!audio) return;
    const at = origin_ref.current + (audio.currentTime || 0);
    if ((audio.currentTime || 0) > 0.3) live_ref.current = true;
    if (at > heard_ref.current) heard_ref.current = at;
    if ((audio.currentTime || 0) > 12) drops_ref.current = 0;
    set_shown(at);
  }

  function on_ended() {
    if (mode_ref.current !== 'playing' || !live_ref.current) return;
    live_ref.current = false;
    const at = place();
    if (same_song(at) && hold_song(at)) return;
    next_track();
  }

  function on_audio_error() {
    const audio = audio_ref.current;
    if (mode_ref.current !== 'playing' || !audio) return;
    if (audio.error?.code === 1) return;
    const was_live = live_ref.current;
    live_ref.current = false;
    const at = place();
    if (was_live && same_song(at) && hold_song(at)) return;
    if (!was_live && drops_ref.current < 2 && hold_song(origin_ref.current)) return;
    drops_ref.current = 0;
    fail_ref.current += 1;
    if (!tracks_ref.current.length || fail_ref.current >= tracks_ref.current.length) {
      mode_ref.current = 'stopped';
      set_mode('stopped');
      set_error('поток не открылся');
      return;
    }
    index_ref.current = (index_ref.current + 1) % tracks_ref.current.length;
    origin_ref.current = 0;
    start_stream(0);
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
        {error ? <p className="mb-1 truncate text-left text-[10px] opacity-70">{error}</p> : null}
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
      <audio ref={audio_ref} hidden onTimeUpdate={on_time} onPlaying={on_time} onEnded={on_ended} onError={on_audio_error} />
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
