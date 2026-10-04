'use client';

import { createElement, useEffect, useState, type ReactNode } from 'react';
import {
  day_task_color,
  live_elapsed_ms,
  type day_task,
} from '@/lib/seller-day-tasks';
import circular_timer from '@/components/seller/circular-timer';

type props = {
  task: day_task;
  mode: 'work' | 'done';
  on_open_guide: () => void;
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
  guide = false,
}: {
  open: boolean;
  on_toggle: () => void;
  color: string;
  guide?: boolean;
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
      aria-label={guide ? 'инструкция' : open ? 'скрыть детали' : 'детали задачи'}
      aria-pressed={guide ? undefined : open}
    >
      {guide ? 'i' : open ? '×' : 'i'}
    </button>
  );
}

function format_stopwatch_ms(ms: number) {
  const total_sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total_sec / 60);
  const s = total_sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** круг как у заказа: белая заливка + цветное кольцо */
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
      className="relative block h-full w-full rounded-full transition active:scale-[0.97]"
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

/** тот же каркас, что у заказа: круг + слот подписи снизу */
function circle_wrap({
  children,
  under,
}: {
  children: ReactNode;
  under?: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 pb-2 pt-3">
      <div className="aspect-square w-[min(100%,68cqh)] shrink-0">{children}</div>
      <p
        className={`mt-1.5 max-w-[92%] truncate text-center text-[clamp(0.65rem,2.8cqw,0.82rem)] font-semibold leading-snug opacity-90 ${
          under ? '' : 'invisible'
        }`}
      >
        {under || '·'}
      </p>
    </div>
  );
}

export default function shift_task_card({ task, mode, on_open_guide }: props) {
  const [now, set_now] = useState(Date.now());
  const color = day_task_color;
  const timed = task.expected_minutes > 0;
  const elapsed = live_elapsed_ms(task, now);
  const progress = timed ? Math.min(1, elapsed / (task.expected_minutes * 60_000)) : 1;
  const timer_colors = {
    fill: '#ffffff',
    ring: color.fg,
    text: color.fg,
    track: color.border,
  };
  const circle_fill = '#ffffff';
  const ticking = task.phase === 'running' || task.phase === 'paused';

  useEffect(() => {
    if (task.phase !== 'running') return;
    const id = window.setInterval(() => set_now(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [task.phase]);

  if (mode === 'done' || task.phase === 'done') {
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
          open: false,
          guide: true,
          on_toggle: on_open_guide,
          color: color.fg,
        })}
        {createElement(circle_wrap, {
          under: task.title,
          children: createElement(circular_timer, {
            progress: 1,
            label: '✓',
            tone: 'handout',
            colors: timer_colors,
            fill: true,
            disabled: true,
            on_click: on_open_guide,
          }),
        })}
      </article>
    );
  }

  const circle = ticking
    ? createElement(circular_timer, {
        progress,
        label: timed ? format_stopwatch_ms(elapsed) : task.phase === 'paused' ? 'пауза' : 'идёт',
        sublabel: task.phase === 'paused' ? 'пауза' : undefined,
        active: task.phase === 'running',
        tone: 'handout',
        colors: timer_colors,
        fill: true,
        hero: true,
        on_click: on_open_guide,
      })
    : createElement(task_ring_shell, {
        fill: circle_fill,
        ring: color.fg,
        track: color.border,
        progress: 1,
        on_click: on_open_guide,
        children: createElement(task_icon, {
          className: 'h-[42%] w-[42%]',
          color: color.fg,
        }),
      });

  return (
    <article
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
        containerType: 'size',
      }}
    >
      {createElement(info_button, {
        open: false,
        guide: true,
        on_toggle: on_open_guide,
        color: color.fg,
      })}
      {createElement(circle_wrap, { under: task.title, children: circle })}
    </article>
  );
}
