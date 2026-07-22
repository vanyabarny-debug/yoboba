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

export default function shift_task_card({ task, mode, on_advance }: props) {
  const [now, set_now] = useState(Date.now());
  const color = day_task_color;
  const expected_ms = Math.max(1, task.expected_minutes) * 60_000;
  const elapsed = live_elapsed_ms(task, now);
  const progress = Math.min(1, elapsed / expected_ms);

  useEffect(() => {
    if (task.phase !== 'running') return;
    const id = window.setInterval(() => set_now(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [task.phase]);

  const timer_label =
    task.phase === 'done'
      ? 'готово'
      : task.phase === 'running'
        ? format_countdown_ms(Math.max(0, expected_ms - elapsed))
        : task.phase === 'stopped'
          ? format_countdown_ms(elapsed)
          : task.phase === 'armed'
            ? 'начать'
            : 'задача';

  const tone =
    task.phase === 'done'
      ? 'done'
      : task.phase === 'running'
        ? 'cooking'
        : task.phase === 'stopped'
          ? 'ready'
          : task.phase === 'armed'
            ? 'idle'
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
        className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border active:scale-[0.98] transition"
        style={{
          backgroundColor: color.bg,
          borderColor: color.border,
          color: color.fg,
        }}
      >
        {createElement(task_icon, { className: 'h-10 w-10 sm:h-12 sm:w-12' })}
        <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">задача</span>
      </button>
    );
  }

  return (
    <article
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border px-2 py-2"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
      }}
    >
      <div className="shrink-0 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">задача дня</p>
        {(task.phase !== 'icon' || mode === 'done') && (
          <>
            <h3 className="mt-0.5 text-xs font-bold leading-snug line-clamp-2">{task.title}</h3>
            {(task.phase === 'info' ||
              task.phase === 'armed' ||
              task.phase === 'running' ||
              task.phase === 'stopped' ||
              mode === 'done') && (
              <p className="mt-0.5 text-[10px] leading-snug opacity-80 line-clamp-2">{task.hint}</p>
            )}
          </>
        )}
      </div>

      <div className="mt-1 min-h-0 flex-1 flex flex-col items-center justify-center">
        {createElement(circular_timer, {
          progress: task.phase === 'done' ? 1 : progress,
          label: timer_label,
          sublabel:
            task.phase === 'running'
              ? 'стоп'
              : task.phase === 'stopped'
                ? 'сделано'
                : task.phase === 'armed'
                  ? 'старт'
                  : undefined,
          active: task.phase === 'running',
          tone,
          compact: true,
          disabled: mode === 'done' || task.phase === 'done' || task.phase === 'info',
          on_click: () => {
            if (task.phase === 'info') return;
            handle_click();
          },
        })}
      </div>

      {task.phase === 'info' ? (
        <button
          type="button"
          onClick={handle_click}
          className="mt-1 w-full shrink-0 rounded-xl bg-white/70 py-2 text-[11px] font-semibold"
        >
          далее
        </button>
      ) : null}

      {task.phase === 'armed' ? (
        <p className="mt-1 text-center text-[9px] font-medium opacity-70 shrink-0">
          нажмите таймер · начать
        </p>
      ) : null}

      {mode === 'done' || task.phase === 'done' ? (
        <p className="mt-1 text-center text-[10px] font-semibold opacity-80 shrink-0">готово</p>
      ) : null}
    </article>
  );
}
