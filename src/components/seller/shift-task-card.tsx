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

function task_icon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
      className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[11px] font-bold leading-none backdrop-blur-sm active:scale-95"
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

function circle_shell({
  children,
  on_click,
  className = '',
}: {
  children: ReactNode;
  on_click?: () => void;
  className?: string;
}) {
  const Tag = on_click ? 'button' : 'div';
  return (
    <Tag
      type={on_click ? 'button' : undefined}
      onClick={on_click}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-white shadow-sm transition active:scale-[0.97] ${className}`}
    >
      {children}
    </Tag>
  );
}

export default function shift_task_card({ task, mode, on_advance }: props) {
  const [now, set_now] = useState(Date.now());
  const [show_info, set_show_info] = useState(false);
  const [exiting, set_exiting] = useState(false);
  const color = day_task_color;
  const expected_ms = Math.max(1, task.expected_minutes) * 60_000;
  const elapsed = live_elapsed_ms(task, now);
  const progress = Math.min(1, elapsed / expected_ms);

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
    play_task_done_chime();
    window.setTimeout(() => {
      on_advance(task.id, 'complete');
    }, 1600);
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
              tone: 'done',
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
    circle = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-full bg-white/85 text-emerald-600 shadow-sm">
        <span className="text-[clamp(1.6rem,10cqw,2.4rem)] font-bold leading-none animate-in zoom-in-50 fade-in duration-500">
          ✓
        </span>
        <span className="text-[clamp(0.7rem,3cqw,0.9rem)] font-semibold">готово</span>
      </div>
    );
  } else if (task.phase === 'stopped') {
    circle = (
      <div
        className="relative h-full w-full overflow-hidden rounded-full bg-neutral-900 text-white shadow-sm"
        aria-label="пауза задачи"
      >
        <div className="absolute inset-y-0 left-1/2 z-10 w-px bg-white/35" />
        <button
          type="button"
          onClick={() => go('continue')}
          className="absolute inset-y-0 left-0 flex w-1/2 flex-col items-center justify-center gap-1 px-2 active:bg-white/10"
        >
          <span className="text-[clamp(0.62rem,3cqw,0.82rem)] font-semibold leading-tight text-center">
            продолжить
          </span>
          <span className="text-[clamp(0.7rem,3.4cqw,0.95rem)] font-bold tabular-nums opacity-80">
            {format_stopwatch_ms(elapsed)}
          </span>
        </button>
        <button
          type="button"
          onClick={complete_with_anim}
          className="absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center gap-1 bg-white/10 px-2 active:bg-white/20"
        >
          <span className="text-[clamp(0.62rem,3cqw,0.82rem)] font-semibold leading-tight text-center">
            выполнено
          </span>
        </button>
      </div>
    );
  } else if (task.phase === 'icon') {
    circle = createElement(circle_shell, {
      on_click: () => go(),
      children: createElement(task_icon, { className: 'h-[38%] w-[38%]' }),
    });
  } else if (task.phase === 'info') {
    circle = createElement(circle_shell, {
      on_click: () => go(),
      children: (
        <span className="max-w-[78%] text-center text-[clamp(0.8rem,4.5cqw,1.15rem)] font-bold leading-tight">
          {task.title}
        </span>
      ),
    });
  } else if (task.phase === 'armed') {
    circle = createElement(circular_timer, {
      progress: 0,
      label: 'начать',
      tone: 'idle',
      fill: true,
      on_click: () => go(),
    });
  } else {
    circle = createElement(circular_timer, {
      progress,
      label: format_stopwatch_ms(elapsed),
      sublabel: 'пауза',
      active: true,
      tone: 'cooking',
      fill: true,
      hero: true,
      on_click: () => go(),
    });
  }

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border transition-all duration-500 ease-out ${
        exiting ? 'scale-90 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
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
