'use client';

import { createElement } from 'react';
import { opening_progress, type opening_task } from '@/lib/opening-checklist';
import circular_timer from '@/components/seller/circular-timer';

type props = {
  task: opening_task;
  on_open: () => void;
};

/** Цвет задачи открытия */
const opening_color = {
  bg: '#E8F5E9',
  fg: '#2E7D32',
  border: '#A5D6A7',
} as const;

function circle_wrap({ children, under }: { children: React.ReactNode; under?: string | null }) {
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

function info_button({
  on_toggle,
  color,
}: {
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
      aria-label="открыть чек-лист"
    >
      i
    </button>
  );
}

export default function opening_task_card({ task, on_open }: props) {
  const progress = opening_progress(task);
  const is_complete = task.completed_at != null;
  const timer_colors = {
    fill: '#ffffff',
    ring: opening_color.fg,
    text: opening_color.fg,
    track: opening_color.border,
  };

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${
        is_complete ? 'opacity-85' : ''
      }`}
      style={{
        backgroundColor: opening_color.bg,
        borderColor: opening_color.border,
        color: opening_color.fg,
        containerType: 'size',
      }}
    >
      {createElement(info_button, {
        on_toggle: on_open,
        color: opening_color.fg,
      })}
      {createElement(circle_wrap, {
        under: is_complete ? 'открытие ✓' : 'открытие',
        children: createElement(circular_timer, {
          progress: progress / 100,
          label: is_complete ? '✓' : `${progress}%`,
          sublabel: is_complete ? undefined : 'выполнено',
          tone: 'handout',
          colors: timer_colors,
          fill: true,
          disabled: is_complete,
          on_click: on_open,
        }),
      })}
    </article>
  );
}
