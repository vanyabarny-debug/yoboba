'use client';

import { useState } from 'react';
import { day_progress, is_day_complete, type day_checklist_task } from '@/lib/day-checklist';

function play_check_sound() {
  const audio_ctx = new AudioContext();
  const oscillator = audio_ctx.createOscillator();
  const gain = audio_ctx.createGain();

  oscillator.connect(gain);
  gain.connect(audio_ctx.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gain.gain.setValueAtTime(0.3, audio_ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audio_ctx.currentTime + 0.1);

  oscillator.start(audio_ctx.currentTime);
  oscillator.stop(audio_ctx.currentTime + 0.1);
}

function play_complete_sound() {
  const audio_ctx = new AudioContext();
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((freq, i) => {
    const oscillator = audio_ctx.createOscillator();
    const gain = audio_ctx.createGain();

    oscillator.connect(gain);
    gain.connect(audio_ctx.destination);

    oscillator.frequency.value = freq;
    oscillator.type = 'sine';

    const start_time = audio_ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.2, start_time);
    gain.gain.exponentialRampToValueAtTime(0.01, start_time + 0.3);

    oscillator.start(start_time);
    oscillator.stop(start_time + 0.3);
  });
}

const is_journal = (text: string) => /^заполнить журнал/i.test(text);

export default function DayTaskGuide({
  task,
  seller_id,
  seller_name,
  on_close,
  on_update,
}: {
  task: day_checklist_task;
  seller_id: string;
  seller_name: string;
  on_close: () => void;
  on_update: (updated: day_checklist_task) => void;
}) {
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const progress = day_progress(task);
  const is_complete = is_day_complete(task);
  const checked_count = task.items.filter((i) => i.is_checked).length;

  /** пункты дня идут в любом порядке — это текущие дела, а не последовательность */
  async function toggle_item(item_id: string, current_state: boolean) {
    if (busy) return;
    set_busy(true);
    set_error('');

    try {
      const res = await fetch('/api/seller/day-task', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          task_id: task.id,
          item_id,
          is_checked: !current_state,
          seller_id,
          seller_name,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        set_error(data.error || 'не удалось обновить');
        return;
      }

      const data = (await res.json()) as { task: day_checklist_task };
      on_update(data.task);

      if (!current_state) play_check_sound();

      if (is_day_complete(data.task) && !task.completed_at) {
        play_complete_sound();
        setTimeout(() => on_close(), 1500);
      }
    } catch {
      set_error('не удалось обновить');
    } finally {
      set_busy(false);
    }
  }

  const chores = task.items.filter((i) => !is_journal(i.item_text));
  const journals = task.items.filter((i) => is_journal(i.item_text));

  function render_item(item: day_checklist_task['items'][number]) {
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => toggle_item(item.id, item.is_checked)}
          disabled={busy}
          className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
            item.is_checked
              ? 'border-blue-500 bg-blue-50'
              : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
          } disabled:cursor-not-allowed`}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
              item.is_checked ? 'border-blue-500 bg-blue-500 text-white' : 'border-blue-300 bg-white text-transparent'
            }`}
          >
            ✓
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className={`font-medium leading-snug ${item.is_checked ? 'text-blue-900' : 'text-neutral-900'}`}>
              {item.item_text}
            </p>
            {item.checked_at && item.checked_by ? (
              <p className="mt-1 text-xs text-neutral-500">
                {item.checked_by} ·{' '}
                {new Date(item.checked_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : null}
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <div className="flex items-center justify-between px-5 py-4">
        <button
          type="button"
          className="text-sm text-neutral-400 hover:text-neutral-700"
          onClick={on_close}
          disabled={busy}
        >
          закрыть
        </button>
        <p className="text-sm tabular-nums text-neutral-400">
          {checked_count} / {task.items.length}
        </p>
        <span className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto max-w-md">
          <p className="text-center text-sm uppercase tracking-[0.16em] text-blue-700">в течение дня</p>
          <h1 className="mt-3 text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Чек-лист дня
          </h1>
          <p className="mt-2 text-center text-sm text-neutral-500">
            отмечайте по мере выполнения — порядок любой, галочку можно снять
          </p>

          {task.spot_address ? (
            <p className="mt-2 text-center text-base text-neutral-500">{task.spot_address}</p>
          ) : null}

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Выполнено</span>
              <span className="font-semibold text-blue-700">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="mt-6 space-y-3">{chores.map(render_item)}</ul>

          {journals.length ? (
            <>
              <p className="mt-8 text-xs uppercase tracking-[0.16em] text-neutral-400">журналы (день)</p>
              <ul className="mt-3 space-y-3">{journals.map(render_item)}</ul>
            </>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
          ) : null}

          {task.completed_at ? (
            <div className="mt-6 rounded-2xl bg-blue-100 p-4 text-center">
              <p className="text-lg font-semibold text-blue-900">✓ Дневные дела закрыты</p>
              <p className="mt-1 text-sm text-blue-700">
                {new Date(task.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </p>
              {task.seller_name ? <p className="mt-1 text-xs text-blue-600">{task.seller_name}</p> : null}
            </div>
          ) : is_complete ? (
            <div className="mt-6 rounded-2xl bg-blue-100 p-4 text-center">
              <p className="text-lg font-semibold text-blue-900">Все пункты выполнены!</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
