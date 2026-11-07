'use client';

import { useEffect, useState } from 'react';
import { format_phone_display } from '@/lib/phone';
import {
  intern_status_label,
  intern_statuses,
  mood_faces,
  type intern,
  type intern_quiz_block,
  type intern_status,
  type intern_work,
} from '@/lib/study/interns';

const months_of = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function visit_label(date: string, time: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || !time) return 'время не выбрано';
  return `${Number(m[3])} ${months_of[Number(m[2]) - 1]} в ${time}`;
}

function submitted_label(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function QuizBlock({ block }: { block: intern_quiz_block }) {
  return (
    <div>
      <p className="font-medium">
        {block.title}: {block.clean} из {block.total} с первой попытки
      </p>
      <ul className="mt-2 space-y-3">
        {block.items.map((item) => (
          <li key={item.question}>
            <p>
              <span className={item.ok ? 'text-[#2fa36b]' : 'text-accent'}>{item.ok ? '✓' : '✗'}</span>{' '}
              <span className="text-neutral-700">{item.question}</span>
              <span className="text-neutral-400">
                {' '}
                · {item.tries} {tries_word(item.tries)}
              </span>
            </p>
            {item.attempts.length ? (
              <ol className="mt-1 space-y-0.5 pl-5 text-xs text-neutral-500">
                {item.attempts.map((attempt, i) => (
                  <li key={`${item.question}-${i}`}>
                    попытка {i + 1}:{' '}
                    {attempt.picks.map((pick, pi) => (
                      <span key={`${pick.text}-${pi}`}>
                        {pi > 0 ? ', ' : ''}
                        <span className={pick.ok ? 'text-[#2fa36b]' : 'text-accent'}>
                          {pick.text} {pick.ok ? '✓' : '✗'}
                        </span>
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            ) : item.wrong.length ? (
              <span className="block pl-5 text-xs text-neutral-400">ошибка: {item.wrong.join(', ')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function tries_word(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'попытка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'попытки';
  return 'попыток';
}

async function fetch_interns() {
  const res = await fetch('/api/admin/interns');
  const data = (await res.json()) as { interns?: intern[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'нет доступа — войдите как админ');
  return data.interns ?? [];
}

export default function InternsManage() {
  const [interns, set_interns] = useState<intern[]>([]);
  const [open, set_open] = useState<string | null>(null);
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);
  const [preview, set_preview] = useState<intern_work | null>(null);

  useEffect(() => {
    fetch_interns()
      .then((list) => {
        set_interns(list);
        set_error('');
      })
      .catch((err) => set_error(err instanceof Error ? err.message : 'ошибка загрузки'))
      .finally(() => set_loading(false));
  }, []);

  async function set_status(id: string, status: intern_status) {
    set_error('');
    try {
      const res = await fetch('/api/admin/interns', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'не удалось сохранить');
      set_interns((rows) => rows.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось сохранить');
    }
  }

  async function remove(id: string) {
    if (!confirm('удалить заявку?')) return;
    set_error('');
    try {
      const res = await fetch(`/api/admin/interns?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'не удалось удалить');
      set_interns((rows) => rows.filter((row) => row.id !== id));
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось удалить');
    }
  }

  const fresh = interns.filter((row) => row.status === 'new').length;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">стажёры</h2>
        <p className="text-sm text-neutral-500">
          заявки с yoStudy: бариста и контент-креаторы{fresh ? ` · новых: ${fresh}` : ''}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-accent text-center bg-white rounded-xl p-3 border border-surface">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-400 text-center py-8">загрузка...</p>
      ) : interns.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">заявок пока нет</p>
      ) : (
        <ul className="space-y-2">
          {interns.map((row) => {
            const opened = open === row.id;
            return (
              <li key={row.id} className="bg-white rounded-xl border border-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => set_open(opened ? null : row.id)}
                  >
                    <p className="font-medium">
                      {row.name}
                      {row.role === 'creator' ? ' · контент' : ''}
                      {row.feedback_mood ? ` ${mood_faces[row.feedback_mood - 1]}` : ''}
                    </p>
                    {row.role === 'creator' ? (
                      <p className="text-sm text-neutral-700 mt-0.5">бартер · до 5 напитков в неделю</p>
                    ) : (
                      <p className="text-sm text-neutral-700 mt-0.5">{visit_label(row.intern_date, row.intern_time)}</p>
                    )}
                    <p className="text-xs text-neutral-500 mt-1">
                      {format_phone_display(row.phone)} · {row.city}
                      {row.role === 'creator' && (row.works?.length ?? 0) ? ` · фото: ${row.works.length}` : ''}
                    </p>
                    {row.role === 'creator' && (row.works?.length ?? 0) > 0 ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {row.works.map((work, index) => (
                          <button
                            key={`${row.id}-${index}`}
                            type="button"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              set_preview(work);
                            }}
                          >
                            <img
                              src={work.data_url}
                              alt={work.name}
                              className="h-16 w-16 rounded-lg object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {row.quiz_results.length > 0 ? (
                      <div className="mt-3 space-y-3 text-sm">
                        {row.quiz_results.map((block) => (
                          <QuizBlock key={block.id} block={block} />
                        ))}
                      </div>
                    ) : null}
                    {row.feedback_liked ? (
                      <p className="text-sm text-neutral-800 mt-2">зашло: {row.feedback_liked}</p>
                    ) : null}
                    {row.feedback_disliked ? (
                      <p className="text-sm text-neutral-800 mt-1">не зашло: {row.feedback_disliked}</p>
                    ) : null}
                    <p className="text-xs text-neutral-400 mt-1">
                      {intern_status_label[row.status]} · анкета {submitted_label(row.created_at)}
                    </p>
                  </div>
                  <a
                    href={`tel:${row.phone}`}
                    className="shrink-0 text-sm text-highlight px-3 py-1.5 rounded-lg border border-surface"
                  >
                    позвонить
                  </a>
                </div>

                {opened ? (
                  <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
                    {row.role === 'creator' ? (
                      <div>
                        <p className="text-neutral-400">работы</p>
                        {row.works?.length ? (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {row.works.map((work, index) => (
                              <button
                                key={`${work.name}-${index}`}
                                type="button"
                                className="text-left"
                                onClick={() => set_preview(work)}
                              >
                                <img
                                  src={work.data_url}
                                  alt={work.name}
                                  className="aspect-square w-full rounded-xl object-cover"
                                />
                                <span className="mt-1 block truncate text-xs text-neutral-500">{work.name}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p>фото не прикрепили</p>
                        )}
                      </div>
                    ) : (
                      <>
                    <p>
                      <span className="text-neutral-400">график </span>
                      {row.schedule.join(', ') || '—'}
                    </p>
                    <p>
                      <span className="text-neutral-400">насколько срочно </span>
                      {row.urgent || '—'}
                    </p>
                    <p>
                      <span className="text-neutral-400">медкнижка </span>
                      {row.medbook || '—'}
                    </p>
                    <p>
                      <span className="text-neutral-400">гость вернул стакан </span>
                      {row.guest || '—'}
                    </p>
                    {row.shift ? (
                      <p>
                        <span className="text-neutral-400">спор со сменой </span>
                        {row.shift}
                      </p>
                    ) : null}
                    <p>
                      <span className="text-neutral-400">любит готовить </span>
                      {row.cook || '—'}
                    </p>
                      </>
                    )}
                    {row.feedback_mood || row.feedback_liked || row.feedback_disliked ? (
                      <div className="rounded-xl bg-neutral-50 p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">отзыв</p>
                        {row.feedback_mood ? (
                          <p>
                            <span className="text-neutral-400">настроение </span>
                            {mood_faces[row.feedback_mood - 1]}
                          </p>
                        ) : null}
                        <p>
                          <span className="text-neutral-400">зашло </span>
                          {row.feedback_liked || '—'}
                        </p>
                        <p>
                          <span className="text-neutral-400">не зашло </span>
                          {row.feedback_disliked || '—'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-neutral-400">отзыв ещё не оставил</p>
                    )}
                    {row.quiz_results.length === 0 ? (
                      <p className="text-neutral-400">тесты ещё не пришли</p>
                    ) : null}

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {intern_statuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => set_status(row.id, status)}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            row.status === status
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'border-surface text-neutral-500'
                          }`}
                        >
                          {intern_status_label[status]}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="text-xs text-accent"
                    >
                      удалить заявку
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <button type="button" className="absolute inset-0" aria-label="закрыть" onClick={() => set_preview(null)} />
          <img src={preview.data_url} alt={preview.name} className="relative max-h-[85vh] max-w-full rounded-2xl" />
        </div>
      ) : null}
    </div>
  );
}
