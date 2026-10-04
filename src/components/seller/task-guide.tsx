'use client';

import { useEffect, useRef, useState } from 'react';
import { play_start_chime } from '@/lib/order-chime';
import { day_task_media_url, type day_task_proof } from '@/lib/day-task-templates';
import { live_elapsed_ms, type day_task } from '@/lib/seller-day-tasks';

function format_watch(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function proof_label(proof: day_task_proof) {
  if (proof === 'photo') return 'приложить фото';
  if (proof === 'video') return 'приложить видео';
  if (proof === 'any') return 'приложить фото или видео';
  return '';
}

function accept_for(proof: day_task_proof) {
  if (proof === 'photo') return 'image/*';
  if (proof === 'video') return 'video/*';
  return 'image/*,video/*';
}

export default function TaskGuide({
  task,
  spot_id,
  on_press,
  on_close,
}: {
  task: day_task;
  spot_id: string;
  on_press: () => void;
  on_close: () => void;
}) {
  const blocks = task.blocks.length ? task.blocks : [];
  const [page, set_page] = useState(0);
  const [now, set_now] = useState(Date.now());
  const [file, set_file] = useState<File | null>(null);
  const [preview, set_preview] = useState('');
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState('');
  const input_ref = useRef<HTMLInputElement>(null);
  const timed = task.expected_minutes > 0;
  const timing = task.phase === 'running' || task.phase === 'paused';
  const elapsed = live_elapsed_ms(task, now);
  const block = blocks[Math.min(page, Math.max(0, blocks.length - 1))];
  const target = task.expected_minutes * 60_000;
  const progress = timed ? Math.min(1, elapsed / target) : 0;

  useEffect(() => {
    if (task.phase !== 'running') return;
    const id = window.setInterval(() => set_now(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [task.phase]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick_file(next: File | undefined) {
    if (!next) return;
    const video = next.type.startsWith('video/');
    const image = next.type.startsWith('image/');
    if (task.proof === 'photo' && !image) {
      set_error('сюда нужно фото');
      return;
    }
    if (task.proof === 'video' && !video) {
      set_error('сюда нужно видео');
      return;
    }
    if (!image && !video) {
      set_error('нужно фото или видео');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    set_file(next);
    set_preview(URL.createObjectURL(next));
    set_error('');
  }

  async function press() {
    if (busy || task.phase === 'done') return;
    if (task.phase === 'paused' && task.proof !== 'none') {
      if (!file) {
        set_error(proof_label(task.proof));
        return;
      }
      set_busy(true);
      set_error('');
      try {
        const body = new FormData();
        body.set('file', file);
        body.set('template_id', task.template_id);
        body.set('spot_id', spot_id);
        const res = await fetch('/api/seller/day-tasks/proof', {
          method: 'POST',
          credentials: 'same-origin',
          body,
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          set_error(data.error || 'не удалось отправить файл');
          return;
        }
      } catch {
        set_error('не удалось отправить файл');
        return;
      } finally {
        set_busy(false);
      }
    }
    if (task.phase === 'pending') play_start_chime();
    on_press();
  }

  const ring = timed ? progress * 360 : timing ? 360 : 0;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white font-heading-soft text-neutral-900">
      <div className="flex items-center justify-between px-5 py-4">
        <button type="button" className="text-sm text-neutral-400 hover:text-neutral-700" onClick={on_close}>
          закрыть
        </button>
        {blocks.length > 1 ? (
          <p className="text-sm tabular-nums text-neutral-400">
            {page + 1} / {blocks.length}
          </p>
        ) : (
          <span />
        )}
        <span className="w-16" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center">
        <p className="text-sm uppercase tracking-[0.16em] text-accent">задача</p>
        <h1 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {task.title}
        </h1>
        {task.hint ? <p className="mt-3 max-w-md text-base text-neutral-500">{task.hint}</p> : null}
        {block ? (
          <div className="mt-8 flex w-full max-w-md flex-col items-center">
            {block.kicker ? (
              <p className="text-sm uppercase tracking-[0.16em] text-accent">{block.kicker}</p>
            ) : null}
            {block.media?.kind === 'image' ? (
              <img
                src={day_task_media_url(block.media.id)}
                alt=""
                className="mt-4 max-h-[38vh] max-w-full rounded-2xl object-contain"
              />
            ) : null}
            {block.media?.kind === 'video' ? (
              <video
                src={day_task_media_url(block.media.id)}
                controls
                playsInline
                className="mt-4 max-h-[38vh] max-w-full rounded-2xl"
              />
            ) : null}
            {block.text ? (
              <p className="mt-4 whitespace-pre-line text-2xl font-semibold leading-snug sm:text-3xl">
                {block.text}
              </p>
            ) : null}
          </div>
        ) : null}
        {blocks.length > 1 ? (
          <div className="mt-6 flex items-center gap-2">
            {blocks.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`страница ${i + 1}`}
                onClick={() => set_page(i)}
                className={`h-2 w-2 rounded-full ${i === page ? 'bg-neutral-900' : 'bg-neutral-300'}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-center px-6 pb-8 pt-4">
        {task.proof !== 'none' && task.phase !== 'done' ? (
          <div className="mb-4 flex w-full max-w-sm flex-col items-center text-center">
            <input
              ref={input_ref}
              type="file"
              accept={accept_for(task.proof)}
              capture={task.proof === 'video' ? undefined : 'environment'}
              className="hidden"
              onChange={(e) => {
                pick_file(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {preview && file?.type.startsWith('image/') ? (
              <img src={preview} alt="" className="mb-3 max-h-36 max-w-full rounded-2xl object-contain" />
            ) : null}
            {preview && file?.type.startsWith('video/') ? (
              <video src={preview} className="mb-3 max-h-36 max-w-full rounded-2xl" controls playsInline />
            ) : null}
            <button
              type="button"
              className="text-sm text-neutral-500 hover:text-neutral-900"
              onClick={() => input_ref.current?.click()}
            >
              {file ? 'заменить файл' : proof_label(task.proof)}
            </button>
          </div>
        ) : null}
        {error ? <p className="mb-3 text-center text-sm text-red-500">{error}</p> : null}
        {timing ? (
          <button
            type="button"
            onClick={() => void press()}
            disabled={busy}
            aria-label={task.phase === 'paused' ? 'завершить задачу' : 'пауза'}
            className="relative h-44 w-44 rounded-full disabled:opacity-60"
            style={{
              background: timed
                ? `conic-gradient(#ff6b6b ${ring}deg, #f3f3f4 0deg)`
                : 'conic-gradient(#ffd0d0 360deg, #f3f3f4 0deg)',
            }}
          >
            <span className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-white">
              <span className="text-4xl font-semibold tabular-nums tracking-tight">
                {timed ? format_watch(elapsed) : task.phase === 'paused' ? 'пауза' : 'идёт'}
              </span>
              <span className="mt-1 text-xs text-neutral-400">
                {busy
                  ? 'отправляю…'
                  : task.phase === 'paused'
                    ? 'ещё раз — готово'
                    : timed
                      ? `из ${task.expected_minutes} мин`
                      : 'нажмите — пауза'}
              </span>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void press()}
            disabled={busy || task.phase === 'done'}
            className="h-14 w-full max-w-sm rounded-full bg-neutral-900 text-base text-white disabled:opacity-50"
          >
            {task.phase === 'done' ? 'выполнено' : 'начать выполнение'}
          </button>
        )}
      </div>
    </div>
  );
}
