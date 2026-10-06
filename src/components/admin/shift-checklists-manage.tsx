'use client';

import { useEffect, useState } from 'react';
import { day_task_media_url } from '@/lib/day-task-templates';
import {
  empty_template_item,
  type checklist_kind,
  type shift_checklist_bundle,
  type shift_checklist_section,
  type shift_checklist_template_item,
} from '@/lib/shift-checklist-templates';

const kind_tabs: { id: checklist_kind; label: string }[] = [
  { id: 'opening', label: 'открытие' },
  { id: 'day', label: 'в течение дня' },
  { id: 'closing', label: 'закрытие' },
];

const proof_options = [
  { id: 'none', label: 'без отчёта' },
  { id: 'photo', label: 'фото от бариста' },
  { id: 'video', label: 'видео от бариста' },
  { id: 'any', label: 'фото или видео' },
] as const;

export default function shift_checklists_manage() {
  const [bundle, set_bundle] = useState<shift_checklist_bundle | null>(null);
  const [tab, set_tab] = useState<checklist_kind>('opening');
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);

  async function reload() {
    set_loading(true);
    try {
      const res = await fetch('/api/admin/shift-checklists', { credentials: 'same-origin' });
      const data = (await res.json()) as { error?: string; bundle?: shift_checklist_bundle };
      if (!res.ok || !data.bundle) throw new Error(data.error || 'не удалось загрузить');
      set_bundle(data.bundle);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось загрузить');
    } finally {
      set_loading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function patch_section(kind: checklist_kind, patch: Partial<shift_checklist_section>) {
    set_bundle((prev) =>
      prev
        ? {
            ...prev,
            [kind]: { ...prev[kind], ...patch },
          }
        : prev
    );
  }

  function patch_item(kind: checklist_kind, id: string, patch: Partial<shift_checklist_template_item>) {
    set_bundle((prev) => {
      if (!prev) return prev;
      const section = prev[kind];
      return {
        ...prev,
        [kind]: {
          ...section,
          items: section.items.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        },
      };
    });
  }

  async function upload_media(kind: checklist_kind, item_id: string, file: File) {
    set_error('');
    const body = new FormData();
    body.set('file', file);
    const res = await fetch('/api/admin/shift-checklists/media', {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    const data = (await res.json()) as { error?: string; media?: shift_checklist_template_item['media'] };
    if (!res.ok || !data.media) {
      set_error(data.error || 'не удалось загрузить файл');
      return;
    }
    patch_item(kind, item_id, { media: data.media });
  }

  async function save() {
    if (!bundle) return;
    set_saving(true);
    set_error('');
    try {
      for (const kind of kind_tabs.map((t) => t.id)) {
        const section = bundle[kind];
        if (!section.items.every((i) => i.text.trim())) {
          set_error(`заполните текст всех пунктов: ${kind_tabs.find((t) => t.id === kind)?.label}`);
          return;
        }
      }
      const res = await fetch('/api/admin/shift-checklists', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bundle }),
      });
      const data = (await res.json()) as { error?: string; bundle?: shift_checklist_bundle };
      if (!res.ok || !data.bundle) throw new Error(data.error || 'не удалось сохранить');
      set_bundle(data.bundle);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось сохранить');
    } finally {
      set_saving(false);
    }
  }

  const section = bundle?.[tab];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">чек-листы смены</h2>
        <p className="text-sm text-neutral-500">
          открытие, день и закрытие на доске бариста. новые смены получают эти пункты; уже начатые сегодня — со старым
          списком
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-surface bg-white p-1">
        {kind_tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => set_tab(row.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === row.id ? 'bg-neutral-900 text-white' : 'text-neutral-500'
            }`}
          >
            {row.label}
          </button>
        ))}
      </div>

      {loading || !section ? (
        <p className="py-8 text-center text-sm text-neutral-400">загрузка...</p>
      ) : (
        <>
          <label className="block rounded-xl border border-surface bg-white p-4 text-center">
            <span className="text-sm text-neutral-600">карточка появляется с (москва)</span>
            <input
              type="time"
              value={section.appear_at}
              onChange={(e) => patch_section(tab, { appear_at: e.target.value })}
              className="mt-2 w-full max-w-[8rem] rounded-xl border border-surface px-4 py-2 text-center text-sm"
            />
          </label>

          <ul className="space-y-3">
            {section.items.map((item, index) => (
              <li key={item.id} className="rounded-xl border border-surface bg-white p-4">
                <p className="text-xs text-neutral-400">пункт {index + 1}</p>
                <textarea
                  value={item.text}
                  rows={2}
                  onChange={(e) => patch_item(tab, item.id, { text: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-surface px-3 py-2 text-sm"
                />
                <label className="mt-2 block text-sm text-neutral-600">
                  отчёт бариста
                  <select
                    value={item.proof}
                    onChange={(e) =>
                      patch_item(tab, item.id, {
                        proof: e.target.value as shift_checklist_template_item['proof'],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-surface px-3 py-2 text-sm"
                  >
                    {proof_options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {item.media?.kind === 'image' ? (
                  <img
                    src={day_task_media_url(item.media.id)}
                    alt=""
                    className="mx-auto mt-2 max-h-32 rounded-xl object-contain"
                  />
                ) : null}
                {item.media?.kind === 'video' ? (
                  <video src={day_task_media_url(item.media.id)} controls className="mx-auto mt-2 max-h-32 rounded-xl" />
                ) : null}
                <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
                  <label className="cursor-pointer rounded-lg border border-surface px-2 py-1">
                    инструкция: фото
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload_media(tab, item.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-surface px-2 py-1">
                    инструкция: видео
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload_media(tab, item.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {item.media ? (
                    <button
                      type="button"
                      className="rounded-lg border border-surface px-2 py-1 text-neutral-500"
                      onClick={() => patch_item(tab, item.id, { media: null })}
                    >
                      убрать файл
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg border border-surface px-2 py-1 text-accent"
                    onClick={() =>
                      patch_section(tab, {
                        items: section.items.filter((row) => row.id !== item.id),
                      })
                    }
                  >
                    удалить пункт
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="w-full rounded-xl border border-surface py-2 text-sm text-neutral-600"
            onClick={() => patch_section(tab, { items: [...section.items, empty_template_item()] })}
          >
            + пункт
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving ? 'сохраняем...' : 'сохранить чек-листы'}
          </button>
        </>
      )}

      {error ? <p className="rounded-xl border border-surface bg-white p-3 text-center text-sm text-accent">{error}</p> : null}
    </div>
  );
}
