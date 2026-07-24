'use client';

import { createElement, useEffect, useState, type ReactNode } from 'react';
import {
  day_task_color,
  live_elapsed_ms,
  type day_task,
} from '@/lib/seller-day-tasks';
import { format_countdown_ms } from '@/lib/kitchen-queue';
import circular_timer from '@/components/seller/circular-timer';
import { play_task_done_chime } from '@/lib/order-chime';

type props = {
  task: day_task;
  mode: 'work' | 'done';
  on_advance: (id: string, choice?: 'continue' | 'complete') => void;
};

function task_icon({ className, color }: { className?: string; color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || 'h-12 w-12'}
      aria-hidden
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function info_button({
  open,
  on_toggle,
  color,
}: {
  open: boolean;
  on_toggle: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        on_toggle();
      }}
      className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[11px] font-bold leading-none backdrop-blur-sm active:scale-95"
      style={{ color }}
      aria-label={open ? 'скрыть детали' : 'детали задачи'}
      aria-pressed={open}
    >
      {open ? '×' : 'i'}
    </button>
  );
}

function format_stopwatch_ms(ms: number) {
  const total_sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total_sec / 60);
  const s = total_sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** круг задачи: светлая заливка плитки + цветное кольцо (не чёрный) */
function task_ring_shell({
  children,
  fill,
  ring,
  track,
  progress = 1,
  on_click,
}: {
  children: ReactNode;
  fill: string;
  ring: string;
  track: string;
  progress?: number;
  on_click?: () => void;
}) {
  const size = 100;
  const stroke = 5.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  const Tag = on_click ? 'button' : 'div';

  return (
    <Tag
      type={on_click ? 'button' : undefined}
      onClick={on_click}
      className="relative block h-full w-full max-h-full max-w-full rounded-full transition active:scale-[0.97]"
      style={{ backgroundColor: fill }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90 h-full w-full" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill={fill}
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-[9%] flex items-center justify-center overflow-hidden rounded-full">
        {children}
      </div>
    </Tag>
  );
}

/** пауза: две команды, то же кольцо и заливка */
function pause_split({
  fill,
  ring,
  track,
  on_continue,
  on_complete,
}: {
  fill: string;
  ring: string;
  track: string;
  on_continue: () => void;
  on_complete: () => void;
}) {
  const size = 100;
  const stroke = 5.5;
  const r = (size - stroke) / 2;

  return (
    <div
      className="relative block h-full w-full max-h-full max-w-full rounded-full"
      style={{ backgroundColor: fill }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill={fill}
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ring}
          strokeWidth={stroke}
        />
        <line
          x1={size / 2}
          y1={stroke * 1.15}
          x2={size / 2}
          y2={size - stroke * 1.15}
          stroke={ring}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-[9%] flex overflow-hidden rounded-full">
        <button
          type="button"
          onClick={on_continue}
          className="flex w-1/2 items-center justify-center px-1.5 active:bg-black/[0.04]"
          aria-label="продолжить"
          style={{ backgroundColor: fill }}
        >
          <span
            className="text-center text-[clamp(0.58rem,3.2cqw,0.82rem)] font-bold leading-tight"
            style={{ color: ring }}
          >
            продолжить
          </span>
        </button>
        <button
          type="button"
          onClick={on_complete}
          className="flex w-1/2 items-center justify-center px-1.5 active:bg-black/[0.04]"
          aria-label="выполнено"
          style={{ backgroundColor: fill }}
        >
          <span
            className="text-center text-[clamp(0.58rem,3.2cqw,0.82rem)] font-bold leading-tight"
            style={{ color: ring }}
          >
            выполнено
          </span>
        </button>
      </div>
    </div>
  );
}

export default function shift_task_card({ task, mode, on_advance }: props) {
  const [now, set_now] = useState(Date.now());
  const [show_info, set_show_info] = useState(false);
  const [exiting, set_exiting] = useState(false);
  const [fading, set_fading] = useState(false);
  const color = day_task_color;
  const expected_ms = Math.max(1, task.expected_minutes) * 60_000;
  const elapsed = live_elapsed_ms(task, now);
  const progress = Math.min(1, elapsed / expected_ms);
  /** всегда явные цвета — без чёрных tone из circular_timer */
  const timer_colors = {
    fill: '#ffffff',
    ring: color.fg,
    text: color.fg,
    track: color.border,
  };
  const circle_fill = '#ffffff';

  useEffect(() => {
    if (task.phase !== 'running') return;
    const id = window.setInterval(() => set_now(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [task.phase]);

  useEffect(() => {
    set_show_info(false);
  }, [task.phase, task.id]);

  function go(choice?: 'continue' | 'complete') {
    if (mode === 'done' || task.phase === 'done' || exiting) return;
    on_advance(task.id, choice);
  }

  function complete_with_anim() {
    if (exiting || mode === 'done' || task.phase === 'done') return;
    set_exiting(true);
    set_fading(false);
    play_task_done_chime();
    window.setTimeout(() => set_fading(true), 2400);
    window.setTimeout(() => {
      on_advance(task.id, 'complete');
    }, 3200);
  }

  if (mode === 'done' || (task.phase === 'done' && !exiting)) {
    return (
      <article
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border opacity-85"
        style={{
          backgroundColor: color.bg,
          borderColor: color.border,
          color: color.fg,
          containerType: 'size',
        }}
      >
        {createElement(info_button, {
          open: show_info,
          on_toggle: () => set_show_info((v) => !v),
          color: color.fg,
        })}
        {show_info ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center px-3 text-center"
            style={{ backgroundColor: `${color.bg}f5` }}
          >
            <h3 className="text-[clamp(0.9rem,4cqw,1.2rem)] font-bold leading-tight">{task.title}</h3>
            <p className="mt-2 text-[clamp(0.65rem,2.6cqw,0.8rem)] opacity-80">{task.hint}</p>
            <p className="mt-2 text-[10px] opacity-55">
              {format_countdown_ms(task.elapsed_ms || 0)}
            </p>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 items-center justify-center p-2 pt-3">
          <div className="aspect-square h-[min(100%,92%)] max-w-full">
            {createElement(circular_timer, {
              progress: 1,
              label: task.title,
              tone: 'handout',
              colors: timer_colors,
              fill: true,
              disabled: true,
              on_click: () => {},
            })}
          </div>
        </div>
      </article>
    );
  }

  let circle: ReactNode = null;

  if (exiting) {
    circle = createElement(task_ring_shell, {
      fill: circle_fill,
      ring: color.fg,
      track: color.border,
      progress: 1,
      children: (
        <div className="flex flex-col items-center justify-center gap-1.5 text-emerald-600">
          <span className="text-[clamp(1.8rem,12cqw,2.8rem)] font-bold leading-none animate-in zoom-in-50 fade-in duration-700">
            ✓
          </span>
          <span className="text-[clamp(0.75rem,3.4cqw,1rem)] font-semibold animate-in fade-in slide-in-from-bottom-1 duration-700 delay-150">
            готово
          </span>
        </div>
      ),
    });
  } else if (task.phase === 'stopped') {
    circle = createElement(pause_split, {
      fill: circle_fill,
      ring: color.fg,
      track: color.border,
      on_continue: () => go('continue'),
      on_complete: complete_with_anim,
    });
  } else if (task.phase === 'icon') {
    circle = createElement(task_ring_shell, {
      fill: circle_fill,
      ring: color.fg,
      track: color.border,
      progress: 1,
      on_click: () => go(),
      children: createElement(task_icon, {
        className: 'h-[42%] w-[42%]',
        color: color.fg,
      }),
    });
  } else if (task.phase === 'info') {
    circle = createElement(circular_timer, {
      progress: 1,
      label: task.title,
      tone: 'handout',
      colors: timer_colors,
      fill: true,
      hero: false,
      on_click: () => go(),
    });
  } else if (task.phase === 'armed') {
    circle = createElement(circular_timer, {
      progress: 1,
      label: 'начать',
      tone: 'handout',
      colors: timer_colors,
      fill: true,
      on_click: () => go(),
    });
  } else {
    circle = createElement(circular_timer, {
      progress,
      label: format_stopwatch_ms(elapsed),
      sublabel: 'пауза',
      active: true,
      tone: 'handout',
      colors: timer_colors,
      fill: true,
      hero: true,
      on_click: () => go(),
    });
  }

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border transition-all duration-700 ease-out ${
        fading
          ? 'scale-90 opacity-0 pointer-events-none'
          : exiting
            ? 'scale-100 opacity-100 pointer-events-none'
            : 'scale-100 opacity-100'
      }`}
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
        containerType: 'size',
      }}
    >
      {createElement(info_button, {
        open: show_info,
        on_toggle: () => set_show_info((v) => !v),
        color: color.fg,
      })}

      {show_info ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-3 text-center backdrop-blur-[2px]"
          style={{ backgroundColor: `${color.bg}f5` }}
        >
          <h3 className="text-[clamp(0.9rem,4cqw,1.25rem)] font-bold leading-tight">{task.title}</h3>
          <p className="mt-2 text-[clamp(0.65rem,2.6cqw,0.8rem)] leading-snug opacity-80">
            {task.hint}
          </p>
          <p className="mt-2 text-[10px] opacity-55">~{task.expected_minutes} мин</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 items-center justify-center p-2 pt-3">
        <div className="aspect-square h-[min(100%,92%)] max-w-full">{circle}</div>
      </div>
    </article>
  );
}
