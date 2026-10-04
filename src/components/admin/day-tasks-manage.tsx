'use client';

import { useEffect, useState } from 'react';
import {
  day_task_media_url,
  type day_task_block,
  type day_task_proof,
  type day_task_proof_record,
  type day_task_template,
} from '@/lib/day-task-templates';

const proof_options: { id: day_task_proof; label: string }[] = [
  { id: 'none', label: 'не нужно' },
  { id: 'photo', label: 'фото' },
  { id: 'video', label: 'видео' },
  { id: 'any', label: 'фото или видео' },
];

function new_id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function empty_block(): day_task_block {
  return { id: new_id('page'), kicker: '', text: '', media: null };
}

function empty_task(): day_task_template {
  return {
    id: new_id('task'),
    title: '',
    hint: '',
    appear_at: '12:00',
    expected_minutes: 5,
    proof: 'none',
    blocks: [empty_block()],
  };
}

export default function day_tasks_manage() {
  const [tasks, set_tasks] = useState<day_task_template[]>([]);
  const [proofs, set_proofs] = useState<day_task_proof_record[]>([]);
  const [draft, set_draft] = useState<day_task_template | null>(null);
  const [untimed, set_untimed] = useState(false);
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);

  async function reload() {
    set_loading(true);
    try {
      const res = await fetch('/api/admin/day-tasks', { credentials: 'same-origin' });
      const data = (await res.json()) as {
        error?: string;
        tasks?: day_task_template[];
        proofs?: day_task_proof_record[];
      };
      if (!res.ok) throw new Error(data.error || 'не удалось загрузить задачи');
      set_tasks(data.tasks || []);
      set_proofs(data.proofs || []);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось загрузить задачи');
    } finally {
      set_loading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function open_new() {
    const task = empty_task();
    set_draft(task);
    set_untimed(false);
    set_error('');
  }

  function open_edit(task: day_task_template) {
    set_draft(structuredClone(task));
    set_untimed(task.expected_minutes === 0);
    set_error('');
  }

  function patch_block(id: string, patch: Partial<day_task_block>) {
    set_draft((prev) =>
      prev
        ? {
            ...prev,
            blocks: prev.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
          }
        : prev
    );
  }

  async function upload_media(block_id: string, file: File) {
    set_error('');
    const body = new FormData();
    body.set('file', file);
    const res = await fetch('/api/admin/day-tasks/media', {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    const data = (await res.json()) as { error?: string; media?: day_task_block['media'] };
    if (!res.ok || !data.media) {
      set_error(data.error || 'не удалось загрузить файл');
      return;
    }
    patch_block(block_id, { media: data.media });
  }

  async function persist(next: day_task_template[]) {
    set_saving(true);
    set_error('');
    try {
      const res = await fetch('/api/admin/day-tasks', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tasks: next }),
      });
      const data = (await res.json()) as { error?: string; tasks?: day_task_template[] };
      if (!res.ok || !data.tasks) throw new Error(data.error || 'не удалось сохранить');
      set_tasks(data.tasks);
      set_draft(null);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось сохранить');
    } finally {
      set_saving(false);
    }
  }

  async function save_draft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const task: day_task_template = {
      ...draft,
      title: draft.title.trim(),
      hint: draft.hint.trim(),
      expected_minutes: untimed ? 0 : Math.min(240, Math.max(1, Math.round(draft.expected_minutes) || 1)),
      blocks: draft.blocks.map((block) => ({
        ...block,
        kicker: block.kicker.trim(),
        text: block.text.trim(),
      })),
    };
    const exists = tasks.some((row) => row.id === task.id);
    const next = exists ? tasks.map((row) => (row.id === task.id ? task : row)) : [...tasks, task];
    await persist(next);
  }

  async function remove_task(id: string) {
    if (!confirm('убрать эту задачу из дня?')) return;
    await persist(tasks.filter((row) => row.id !== id));
  }

  const sorted = [...tasks].sort((a, b) => a.appear_at.localeCompare(b.appear_at));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">задачи дня</h2>
        <p className="text-sm text-neutral-500">
          чистые страницы для бариста. вылетают по времени москвы. одна кнопка: начать, пауза, готово
        </p>
      </div>

      <button
        type="button"
        onClick={open_new}
        className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground"
      >
        + задача
      </button>

      {error && !draft ? (
        <p className="rounded-xl border border-surface bg-white p-3 text-center text-sm text-accent">{error}</p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-neutral-400">загрузка...</p>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">задач пока нет</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((task) => {
            const shots = proofs.filter((row) => row.template_id === task.id);
            return (
              <li key={task.id} className="rounded-xl border border-surface bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-center sm:text-left">
                    <p className="font-medium">
                      {task.appear_at} · {task.title}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {task.expected_minutes > 0 ? `${task.expected_minutes} мин` : 'без таймера'}
                      {' · '}
                      {task.blocks.length} {task.blocks.length === 1 ? 'страница' : 'страницы'}
                      {task.proof !== 'none'
                        ? ` · сдача: ${proof_options.find((o) => o.id === task.proof)?.label}`
                        : ''}
                    </p>
                    {task.hint ? <p className="mt-1 text-xs text-neutral-400">{task.hint}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => open_edit(task)}
                      className="rounded-lg border border-surface px-3 py-1.5 text-sm text-highlight"
                    >
                      изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove_task(task.id)}
                      className="rounded-lg border border-surface px-3 py-1.5 text-sm text-accent"
                    >
                      удалить
                    </button>
                  </div>
                </div>
                {shots.length ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {shots.map((shot) =>
                      shot.media.kind === 'image' ? (
                        <img
                          key={shot.id}
                          src={day_task_media_url(shot.media.id)}
                          alt=""
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ) : (
                        <video
                          key={shot.id}
                          src={day_task_media_url(shot.media.id)}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      )
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/40"
            onClick={() => set_draft(null)}
          />
          <form
            onSubmit={(e) => void save_draft(e)}
            className="relative max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-soft"
          >
            <h2 className="text-center text-lg font-semibold">
              {tasks.some((row) => row.id === draft.id) ? 'изменить задачу' : 'новая задача'}
            </h2>
            <label className="block text-center">
              <span className="text-sm text-neutral-600">название</span>
              <input
                value={draft.title}
                onChange={(e) => set_draft({ ...draft, title: e.target.value })}
                className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-center text-sm"
                required
              />
            </label>
            <label className="block text-center">
              <span className="text-sm text-neutral-600">коротко, по желанию</span>
              <input
                value={draft.hint}
                onChange={(e) => set_draft({ ...draft, hint: e.target.value })}
                className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-center text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-center">
                <span className="text-sm text-neutral-600">вылетает</span>
                <input
                  type="time"
                  value={draft.appear_at}
                  onChange={(e) => set_draft({ ...draft, appear_at: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-center text-sm"
                  required
                />
              </label>
              <label className="block text-center">
                <span className="text-sm text-neutral-600">минут на задачу</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  disabled={untimed}
                  value={untimed ? '' : draft.expected_minutes}
                  onChange={(e) =>
                    set_draft({ ...draft, expected_minutes: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-center text-sm disabled:bg-neutral-50"
                />
              </label>
            </div>
            <label className="flex items-center justify-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={untimed}
                onChange={(e) => set_untimed(e.target.checked)}
              />
              без таймера
            </label>
            <label className="block text-center">
              <span className="text-sm text-neutral-600">бариста прикладывает</span>
              <select
                value={draft.proof}
                onChange={(e) => set_draft({ ...draft, proof: e.target.value as day_task_proof })}
                className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-center text-sm"
              >
                {proof_options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-3">
              {draft.blocks.map((block, index) => (
                <div key={block.id} className="rounded-xl border border-surface p-3 text-center">
                  <p className="text-xs text-neutral-400">страница {index + 1}</p>
                  <input
                    value={block.kicker}
                    placeholder="подпись"
                    onChange={(e) => patch_block(block.id, { kicker: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-surface px-3 py-2 text-center text-sm"
                  />
                  <textarea
                    value={block.text}
                    placeholder="текст страницы"
                    rows={3}
                    onChange={(e) => patch_block(block.id, { text: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-surface px-3 py-2 text-center text-sm"
                  />
                  {block.media?.kind === 'image' ? (
                    <img
                      src={day_task_media_url(block.media.id)}
                      alt=""
                      className="mx-auto mt-2 max-h-40 rounded-xl object-contain"
                    />
                  ) : null}
                  {block.media?.kind === 'video' ? (
                    <video
                      src={day_task_media_url(block.media.id)}
                      controls
                      className="mx-auto mt-2 max-h-40 rounded-xl"
                    />
                  ) : null}
                  <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
                    <label className="cursor-pointer rounded-lg border border-surface px-2 py-1">
                      фото
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload_media(block.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <label className="cursor-pointer rounded-lg border border-surface px-2 py-1">
                      видео
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload_media(block.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {block.media ? (
                      <button
                        type="button"
                        className="rounded-lg border border-surface px-2 py-1 text-neutral-500"
                        onClick={() => patch_block(block.id, { media: null })}
                      >
                        убрать файл
                      </button>
                    ) : null}
                    {draft.blocks.length > 1 ? (
                      <button
                        type="button"
                        className="rounded-lg border border-surface px-2 py-1 text-accent"
                        onClick={() =>
                          set_draft({
                            ...draft,
                            blocks: draft.blocks.filter((row) => row.id !== block.id),
                          })
                        }
                      >
                        убрать страницу
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="w-full rounded-xl border border-surface py-2 text-sm text-neutral-600"
                onClick={() => set_draft({ ...draft, blocks: [...draft.blocks, empty_block()] })}
              >
                + страница
              </button>
            </div>

            {error ? <p className="text-center text-sm text-accent">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set_draft(null)}
                className="flex-1 rounded-xl border border-surface py-2.5 text-sm"
              >
                отмена
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saving ? 'сохраняем...' : 'сохранить'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
