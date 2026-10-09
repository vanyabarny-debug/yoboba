'use client';

import { useRef, useState } from 'react';
import { closing_progress, is_closing_complete, type closing_task } from '@/lib/closing-checklist';
import {
  ChecklistInstructionMedia,
  ChecklistProofPreview,
} from '@/components/seller/checklist-item-actions';
import type { seller_shift_record } from '@/lib/types';

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
  on_shift,
}: {
  task: closing_task;
  seller_id: string;
  seller_name: string;
  on_close: () => void;
  on_update: (updated: closing_task) => void;
  on_shift?: (shift: seller_shift_record) => void;
}) {
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const file_ref = useRef<HTMLInputElement>(null);
  const [pending_id, set_pending_id] = useState<string | null>(null);
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
          spot_id: task.spot_id || undefined,
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

  async function patch_item(item_id: string, is_checked: boolean) {
    const res = await fetch('/api/seller/closing-task', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        task_id: task.id,
        item_id,
        is_checked,
        seller_id,
        seller_name,
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error || 'не удалось обновить');
    }
    return (await res.json()) as { task: closing_task; shift?: seller_shift_record | null };
  }

  async function upload_proof(item: closing_task['items'][number], file: File) {
    const body = new FormData();
    body.set('file', file);
    body.set('kind', 'closing');
    body.set('task_id', task.id);
    body.set('item_id', item.id);
    body.set('spot_id', task.spot_id || 'unknown');
    body.set('item_order', String(item.item_order));
    body.set('shift_date', task.shift_date);
    const res = await fetch('/api/seller/checklist-proof', { method: 'POST', credentials: 'same-origin', body });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'не удалось отправить файл');
  }

  async function toggle_item(item: closing_task['items'][number]) {
    if (busy || task.completed_at) return;
    const current_state = item.is_checked;
    const previous_items = task.items.filter((i) => i.item_order < item.item_order);
    const all_previous_checked = previous_items.every((i) => i.is_checked);

    if (!all_previous_checked && !current_state) {
      set_error('выполняйте пункты по порядку');
      setTimeout(() => set_error(''), 2000);
      return;
    }

    if (!current_state && item.proof && item.proof !== 'none' && !item.proof_media) {
      set_pending_id(item.id);
      file_ref.current?.click();
      return;
    }

    if (!is_started) await start_task();

    set_busy(true);
    set_error('');
    try {
      const data = await patch_item(item.id, !current_state);
      on_update(data.task);
      if (data.shift) on_shift?.(data.shift);
      if (!current_state) play_check_sound();
      if (is_closing_complete(data.task)) {
        play_complete_sound();
        setTimeout(() => on_close(), 1500);
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось обновить');
    } finally {
      set_busy(false);
    }
  }

  async function on_proof_file(file: File | undefined) {
    const item = task.items.find((i) => i.id === pending_id);
    if (!file || !item) return;
    if (!is_started) await start_task();
    set_busy(true);
    set_error('');
    try {
      await upload_proof(item, file);
      const data = await patch_item(item.id, true);
      on_update(data.task);
      if (data.shift) on_shift?.(data.shift);
      play_check_sound();
      set_pending_id(null);
      if (is_closing_complete(data.task)) {
        play_complete_sound();
        setTimeout(() => on_close(), 1500);
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось отправить');
    } finally {
      set_busy(false);
      if (file_ref.current) file_ref.current.value = '';
    }
  }

  const pending_item = task.items.find((i) => i.id === pending_id);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <input
        ref={file_ref}
        type="file"
        accept={
          pending_item?.proof === 'photo'
            ? 'image/*'
            : pending_item?.proof === 'video'
              ? 'video/*'
              : 'image/*,video/*'
        }
        className="hidden"
        onChange={(e) => void on_proof_file(e.target.files?.[0])}
      />
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
                    onClick={() => void toggle_item(item)}
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
                      {item.proof && item.proof !== 'none' ? (
                        <p className="mt-1 text-xs text-orange-700">
                          {item.proof === 'photo' ? 'нужно фото' : item.proof === 'video' ? 'нужно видео' : 'фото или видео'}
                        </p>
                      ) : null}
                      {item.instruction_media ? <ChecklistInstructionMedia media={item.instruction_media} /> : null}
                      {item.proof_media ? <ChecklistProofPreview media={item.proof_media} /> : null}
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
