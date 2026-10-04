'use client';

import { useState } from 'react';
import { opening_progress, is_opening_complete, type opening_task } from '@/lib/opening-checklist';

export default function OpeningTaskGuide({
  task,
  seller_id,
  seller_name,
  on_close,
  on_update,
}: {
  task: opening_task;
  seller_id: string;
  seller_name: string;
  on_close: () => void;
  on_update: (updated: opening_task) => void;
}) {
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const progress = opening_progress(task);
  const is_complete = is_opening_complete(task);
  const is_started = task.started_at != null;

  async function start_task() {
    if (busy || is_started) return;
    set_busy(true);
    set_error('');
    
    try {
      const res = await fetch('/api/seller/opening-task', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          task_id: task.id,
          seller_id,
          seller_name,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        set_error(data.error || 'не удалось начать задачу');
        return;
      }

      on_update({
        ...task,
        started_at: new Date().toISOString(),
        seller_id,
        seller_name,
      });
    } catch {
      set_error('не удалось начать задачу');
    } finally {
      set_busy(false);
    }
  }

  async function toggle_item(item_id: string, current_state: boolean) {
    if (busy || task.completed_at) return;

    // Начать задачу автоматически при первом клике
    if (!is_started) {
      await start_task();
    }

    set_busy(true);
    set_error('');

    try {
      const res = await fetch('/api/seller/opening-task', {
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

      const data = (await res.json()) as { task: opening_task };
      on_update(data.task);

      // Если задача завершена — закрыть через секунду
      if (is_opening_complete(data.task)) {
        setTimeout(() => {
          on_close();
        }, 1000);
      }
    } catch {
      set_error('не удалось обновить');
    } finally {
      set_busy(false);
    }
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
          {task.items.filter((i) => i.is_checked).length} / {task.items.length}
        </p>
        <span className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto max-w-md">
          <p className="text-center text-sm uppercase tracking-[0.16em] text-accent">
            открытие смены
          </p>
          <h1 className="mt-3 text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Чек-лист открытия
          </h1>
          
          {task.spot_address ? (
            <p className="mt-2 text-center text-base text-neutral-500">
              {task.spot_address}
            </p>
          ) : null}

          {/* Прогресс-бар */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Выполнено</span>
              <span className="font-semibold text-green-600">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Список пунктов */}
          <ul className="mt-6 space-y-3">
            {task.items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle_item(item.id, item.is_checked)}
                  disabled={busy || task.completed_at != null}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
                    item.is_checked
                      ? 'border-green-500 bg-green-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  } disabled:opacity-50`}
                >
                  {/* Номер / Галочка */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      item.is_checked
                        ? 'bg-green-500 text-white'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {item.is_checked ? '✓' : index + 1}
                  </div>

                  {/* Текст */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className={`font-medium leading-snug ${
                        item.is_checked ? 'text-green-900' : 'text-neutral-900'
                      }`}
                    >
                      {item.item_text}
                    </p>
                    {item.checked_at && item.checked_by ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        {item.checked_by} ·{' '}
                        {new Date(item.checked_at).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Ошибка */}
          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {/* Статус завершения */}
          {task.completed_at ? (
            <div className="mt-6 rounded-2xl bg-green-100 p-4 text-center">
              <p className="text-lg font-semibold text-green-900">
                ✓ Открытие завершено
              </p>
              <p className="mt-1 text-sm text-green-700">
                {new Date(task.completed_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {task.seller_name ? (
                <p className="mt-1 text-xs text-green-600">{task.seller_name}</p>
              ) : null}
            </div>
          ) : is_complete ? (
            <div className="mt-6 rounded-2xl bg-green-100 p-4 text-center">
              <p className="text-lg font-semibold text-green-900">
                Все пункты выполнены!
              </p>
              <p className="mt-1 text-sm text-green-700">
                Открытие завершается...
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
