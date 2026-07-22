'use client';

import type { day_task } from '@/lib/seller-day-tasks';
import { color_for_id } from '@/lib/seller-tile-grid';

type props = {
  task: day_task;
  /** pending+in_progress на «в работе», done на «готовые» */
  mode: 'work' | 'done';
  on_start: (id: string) => void;
  on_complete: (id: string) => void;
};

export default function shift_task_card({ task, mode, on_start, on_complete }: props) {
  const color = color_for_id(task.id);
  const busy = task.status === 'in_progress';

  return (
    <article
      className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-2xl border p-2.5"
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.fg,
      }}
    >
      <div className="min-h-0">
        <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">задача дня</p>
        <h3 className="mt-0.5 text-sm font-bold leading-snug line-clamp-2">{task.title}</h3>
        <p className="mt-1 text-[10px] leading-snug opacity-80 line-clamp-2">{task.hint}</p>
      </div>

      <div className="mt-2 shrink-0">
        {mode === 'done' ? (
          <p className="rounded-xl bg-white/50 py-2 text-center text-[11px] font-semibold">
            готово
          </p>
        ) : busy ? (
          <button
            type="button"
            onClick={() => on_complete(task.id)}
            className="w-full rounded-xl bg-neutral-900 py-2 text-[11px] font-semibold text-white"
          >
            завершить
          </button>
        ) : (
          <button
            type="button"
            onClick={() => on_start(task.id)}
            className="w-full rounded-xl border border-current/20 bg-white/70 py-2 text-[11px] font-semibold"
          >
            в работу
          </button>
        )}
        {busy ? (
          <p className="mt-1 text-center text-[9px] font-medium uppercase tracking-wide opacity-70">
            в работе
          </p>
        ) : null}
      </div>
    </article>
  );
}
