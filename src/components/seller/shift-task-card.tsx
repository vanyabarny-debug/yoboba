'use client';

import { createElement, useEffect, useState } from 'react';
import {
  day_task_color,
  live_elapsed_ms,
  type day_task,
} from '@/lib/seller-day-tasks';
import { format_countdown_ms } from '@/lib/kitchen-queue';
import circular_timer from '@/components/seller/circular-timer';

type props = {
  task: day_task;
  mode: 'work' | 'done';
  on_advance: (id: string) => void;
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

export default function shift_task_card({ task, mode, on_advance }: props) {
  const [now, set_now] = useState(Date.now());
  const [show_info, set_show_info] = useState(false);
  const color = day_task_color;
  const expected_ms = Math.max(1, task.expected_minutes) * 60_000;
  const elapsed = live_elapsed_ms(task, now);
  const progress = Math.min(1, elapsed / expected_ms);

  useEffect(() => {
    if (task.phase !== 'running') return;
    const id = window.setInterval(() => set_now(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [task.phase]);

  useEffect(() => {
    set_show_info(false);
  }, [task.phase, task.id]);

  const timer_label =
    task.phase === 'done'
      ? 'готово'
      : task.phase === 'running'
        ? format_countdown_ms(Math.max(0, expected_ms - elapsed))
        : task.phase === 'stopped'
          ? format_countdown_ms(elapsed)
          : task.phase === 'armed'
            ? ''
            : 'задача';

  const tone =
    task.phase === 'done'
      ? 'done'
      : task.phase === 'running'
        ? 'cooking'
        : task.phase === 'stopped'
          ? 'ready'
          : 'idle';

  function handle_click() {
    if (mode === 'done' || task.phase === 'done') return;
    on_advance(task.id);
  }

  // фаза icon — только универсальная иконка
  if (task.phase === 'icon' && mode === 'work') {
    return (
      <button
        type="button"
        onClick={handle_click}
        className="relative flex h-full min-h-0 w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border active:scale-[0.98] transition"
        style={{
          backgroundColor: color.bg,
          borderColor: color.border,
          color: color.fg,
        }}
      >
        {createElement(task_icon, { className: 'h-9 w-9 sm:h-11 sm:w-11' })}
      </button>
    );
  }

  // фаза info — только текст задачи по центру
  if (task.phase === 'info' && mode === 'work') {
    return (
      <button
        type="button"
        onClick={handle_click}
        className="relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border px-3 py-3 text-center active:scale-[0.98] transition"
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
        <h3 className="max-w-[92%] text-[clamp(0.95rem,4.2cqw,1.35rem)] font-bold leading-tight tracking-tight">
          {task.title}
        </h3>
        {show_info ? (
          <p className="mt-2 max-w-[90%] text-[clamp(0.65rem,2.8cqw,0.85rem)] leading-snug opacity-80">
            {task.hint}
          </p>
        ) : null}
      </button>
    );
  }

  const timer_phase =
    task.phase === 'armed' ||
    task.phase === 'running' ||
    task.phase === 'stopped' ||
    task.phase === 'done' ||
    mode === 'done';

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
        open: show_info,
        on_toggle: () => set_show_info((v) => !v),
        color: color.fg,
      })}

      {show_info ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-3 text-center backdrop-blur-[2px]"
          style={{ backgroundColor: `${color.bg}f5` }}
        >
          <h3 className="text-[clamp(0.9rem,4cqw,1.25rem)] font-bold leading-tight">
            {task.title}
          </h3>
          <p className="mt-2 text-[clamp(0.65rem,2.6cqw,0.8rem)] leading-snug opacity-80">
            {task.hint}
          </p>
          <p className="mt-2 text-[10px] opacity-55">~{task.expected_minutes} мин</p>
        </div>
      ) : null}

      {timer_phase ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-2 pt-3">
          <div className="aspect-square h-[min(100%,92%)] max-w-full">
            {createElement(circular_timer, {
              progress: task.phase === 'done' || mode === 'done' ? 1 : progress,
              label: timer_label,
              sublabel:
                task.phase === 'running'
                  ? 'стоп'
                  : task.phase === 'stopped'
                    ? 'сделано'
                    : undefined,
              active: task.phase === 'running',
              tone: mode === 'done' ? 'done' : tone,
              fill: true,
              disabled: mode === 'done' || task.phase === 'done',
              on_click: handle_click,
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
