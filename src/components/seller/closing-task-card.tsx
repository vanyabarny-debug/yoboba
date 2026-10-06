'use client';

import { createElement } from 'react';
import { closing_progress, type closing_task } from '@/lib/closing-checklist';
import circular_timer from '@/components/seller/circular-timer';

type props = {
  task: closing_task;
  on_open: () => void;
};

/** Цвет задачи закрытия */
const closing_color = {
  bg: '#FFF3E0',
  fg: '#E65100',
  border: '#FFB74D',
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

export default function closing_task_card({ task, on_open }: props) {
  const progress = closing_progress(task);
  const is_complete = task.completed_at != null;
  const timer_colors = {
    fill: '#ffffff',
    ring: closing_color.fg,
    text: closing_color.fg,
    track: closing_color.border,
  };

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border ${
        is_complete ? 'opacity-85' : ''
      }`}
      style={{
        backgroundColor: closing_color.bg,
        borderColor: closing_color.border,
        color: closing_color.fg,
        containerType: 'size',
      }}
    >
      {createElement(info_button, {
        on_toggle: on_open,
        color: closing_color.fg,
      })}
      {createElement(circle_wrap, {
        under: is_complete ? 'закрытие ✓' : 'закрытие',
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
