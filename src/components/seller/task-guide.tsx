'use client';

import { useState } from 'react';
import { play_start_chime } from '@/lib/order-chime';
import { steps_for_task, type day_task } from '@/lib/seller-day-tasks';

type phase = 'intro' | 'step';

export default function TaskGuide({
  task,
  on_start,
  on_close,
}: {
  task: day_task;
  on_start: () => void;
  on_close: () => void;
}) {
  const steps = steps_for_task(task);
  const [phase, set_phase] = useState<phase>('intro');
  const [step_i, set_step_i] = useState(0);
  const started = task.phase === 'running' || task.phase === 'stopped' || task.phase === 'done';
  const current = steps[step_i];
  const progress = phase === 'step' && steps.length ? (step_i + 1) / steps.length : 0;

  function start_if_needed() {
    if (task.phase === 'done' || task.phase === 'running' || task.phase === 'stopped') return;
    play_start_chime();
    on_start();
  }

  function skip() {
    start_if_needed();
    on_close();
  }

  function view() {
    if (!steps.length) {
      skip();
      return;
    }
    start_if_needed();
    set_phase('step');
    set_step_i(0);
  }

  function go_next() {
    if (step_i + 1 >= steps.length) {
      on_close();
      return;
    }
    set_step_i(step_i + 1);
  }

  function go_back() {
    if (phase === 'step' && step_i > 0) {
      set_step_i(step_i - 1);
      return;
    }
    if (phase === 'step') {
      set_phase('intro');
      return;
    }
    on_close();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <div className="h-1 bg-neutral-100">
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="flex items-center justify-between px-5 py-4">
        <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={go_back}>
          {phase === 'intro' ? 'закрыть' : 'назад'}
        </button>
        {phase === 'step' && steps.length ? (
          <p className="text-sm tabular-nums text-neutral-400">
            {step_i + 1} / {steps.length}
          </p>
        ) : (
          <span />
        )}
        <span className="w-16" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 pb-10">
        {phase === 'intro' ? (
          <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pt-2">
              <p className="text-center text-sm uppercase tracking-[0.16em] text-accent">задача</p>
              <h1 className="mt-3 text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                {task.title}
              </h1>
              {task.hint ? <p className="mt-3 text-center text-base text-neutral-500">{task.hint}</p> : null}
              <p className="mt-1 text-center text-sm text-neutral-400">~{task.expected_minutes} мин</p>
              {steps.length ? (
                <ul className="mt-8 divide-y divide-neutral-100">
                  {steps.map((s, i) => (
                    <li key={`${s.title}-${i}`} className="flex items-baseline gap-3 py-3">
                      <span className="w-6 shrink-0 text-sm tabular-nums text-neutral-400">{i + 1}</span>
                      <div className="min-w-0">
                        {s.hint ? (
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">{s.hint}</p>
                        ) : null}
                        <p className="text-lg font-medium leading-snug">{s.title}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="shrink-0 pt-6">
              {steps.length ? (
                <>
                  <button
                    type="button"
                    className="w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
                    onClick={view}
                  >
                    посмотреть
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full py-2 text-base text-neutral-400 hover:text-neutral-700"
                    onClick={skip}
                  >
                    {started ? 'закрыть' : 'пропустить'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
                  onClick={skip}
                >
                  {started ? 'закрыть' : 'начать'}
                </button>
              )}
            </div>
          </div>
        ) : current ? (
          <div className="m-auto w-full max-w-md text-center">
            {current.hint ? (
              <p className="text-sm uppercase tracking-[0.16em] text-accent">{current.hint}</p>
            ) : (
              <p className="text-sm uppercase tracking-[0.16em] text-accent">шаг</p>
            )}
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {current.title}
            </h1>
            <button
              type="button"
              className="mt-10 w-full rounded-pill bg-neutral-900 py-3.5 text-base text-white"
              onClick={go_next}
            >
              {step_i + 1 >= steps.length ? 'готово' : 'дальше'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
