'use client';

import { useState } from 'react';
import { closing_progress, is_closing_complete, type closing_task } from '@/lib/closing-checklist';

// Звук при отметке пункта
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

// Звук при завершении всех пунктов
function play_complete_sound() {
  const audio_ctx = new AudioContext();
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  
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

export default function ClosingTaskGuide({
  task,
  seller_id,
  seller_name,
  on_close,
  on_update,
}: {
  task: closing_task;
  seller_id: string;
  seller_name: string;
  on_close: () => void;
  on_update: (updated: closing_task) => void;
}) {
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const progress = closing_progress(task);
  const is_complete = is_closing_complete(task);
  const is_started = task.started_at != null;

  async function start_task() {
    if (busy || is_started) return;
    set_busy(true);
    set_error('');
    
    try {
      const res = await fetch('/api/seller/closing-task', {
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

  async function toggle_item(item_id: string, current_state: boolean, item_order: number) {
    if (busy || task.completed_at) return;

    // Проверить что все предыдущие пункты выполнены
    const previous_items = task.items.filter((i) => i.item_order < item_order);
    const all_previous_checked = previous_items.every((i) => i.is_checked);
    
    if (!all_previous_checked && !current_state) {
      set_error('выполняйте пункты по порядку');
      setTimeout(() => set_error(''), 2000);
      return;
    }

    // Начать задачу автоматически при первом клике
    if (!is_started) {
      await start_task();
    }

    set_busy(true);
    set_error('');

    try {
      const res = await fetch('/api/seller/closing-task', {
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

      const data = (await res.json()) as { task: closing_task };
      on_update(data.task);

      // Воспроизвести звук
      if (!current_state) {
        play_check_sound();
      }

      // Если задача завершена — воспроизвести звук завершения и закрыть
      if (is_closing_complete(data.task)) {
        play_complete_sound();
        setTimeout(() => {
          on_close();
        }, 1500);
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
          <p className="text-center text-sm uppercase tracking-[0.16em] text-orange-600">
            закрытие смены
          </p>
          <h1 className="mt-3 text-center text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Чек-лист закрытия
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
              <span className="font-semibold text-orange-600">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Список пунктов */}
          <ul className="mt-6 space-y-3">
            {task.items.map((item, index) => {
              // Проверить доступность пункта (все предыдущие выполнены)
              const previous_items = task.items.filter((i) => i.item_order < item.item_order);
              const all_previous_checked = previous_items.every((i) => i.is_checked);
              const is_available = item.is_checked || all_previous_checked;
              
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle_item(item.id, item.is_checked, item.item_order)}
                    disabled={busy || task.completed_at != null || !is_available}
                    className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
                      item.is_checked
                        ? 'border-orange-500 bg-orange-50'
                        : is_available
                        ? 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
                        : 'border-neutral-100 bg-neutral-50'
                    } disabled:cursor-not-allowed`}
                  >
                    {/* Номер / Галочка */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        item.is_checked
                          ? 'bg-orange-500 text-white'
                          : is_available
                          ? 'bg-orange-600 text-white'
                          : 'bg-neutral-200 text-neutral-400'
                      }`}
                    >
                      {item.is_checked ? '✓' : index + 1}
                    </div>

                    {/* Текст */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className={`font-medium leading-snug ${
                          item.is_checked
                            ? 'text-orange-900'
                            : is_available
                            ? 'text-neutral-900'
                            : 'text-neutral-400'
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
                      {!is_available && !item.is_checked ? (
                        <p className="mt-1 text-xs text-neutral-400">
                          выполните предыдущие пункты
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Ошибка */}
          {error ? (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {/* Статус завершения */}
          {task.completed_at ? (
            <div className="mt-6 rounded-2xl bg-orange-100 p-4 text-center">
              <p className="text-lg font-semibold text-orange-900">
                ✓ Закрытие завершено
              </p>
              <p className="mt-1 text-sm text-orange-700">
                {new Date(task.completed_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {task.seller_name ? (
                <p className="mt-1 text-xs text-orange-600">{task.seller_name}</p>
              ) : null}
            </div>
          ) : is_complete ? (
            <div className="mt-6 rounded-2xl bg-orange-100 p-4 text-center">
              <p className="text-lg font-semibold text-orange-900">
                Все пункты выполнены!
              </p>
              <p className="mt-1 text-sm text-orange-700">
                Закрытие завершается...
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
