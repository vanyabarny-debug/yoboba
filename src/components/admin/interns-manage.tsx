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

function quiz_line(blocks: intern_quiz_block[]) {
  if (!blocks.length) return '';
  return blocks.map((b) => `${b.title} ${b.clean}/${b.total}`).join(' · ');
}

function QuizBlock({ block }: { block: intern_quiz_block }) {
  return (
    <div>
      <p className="font-medium">
        {block.title}: {block.clean} из {block.total} с первой попытки
      </p>
      <ul className="mt-1 space-y-1">
        {block.items.map((item) => (
          <li key={item.question}>
            <span className={item.ok ? 'text-[#2fa36b]' : 'text-accent'}>{item.ok ? '✓' : '✗'}</span>{' '}
            <span className="text-neutral-700">{item.question}</span>
            {!item.ok && item.wrong.length ? (
              <span className="block pl-5 text-xs text-neutral-400">ошибка: {item.wrong.join(', ')}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function InternsManage() {
  const [interns, set_interns] = useState<intern[]>([]);
  const [open, set_open] = useState<string | null>(null);
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(true);

  async function reload() {
    set_loading(true);
    try {
      const res = await fetch('/api/admin/interns');
      const data = (await res.json()) as { interns?: intern[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'нет доступа — войдите как админ');
      set_interns(data.interns ?? []);
      set_error('');
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'ошибка загрузки');
    } finally {
      set_loading(false);
    }
  }

  useEffect(() => {
    reload();
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
          заявки с yoStudy{fresh ? ` · новых: ${fresh}` : ''}
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
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    onClick={() => set_open(opened ? null : row.id)}
                  >
                    <p className="font-medium">
                      {row.name}
                      {row.feedback_mood ? ` ${mood_faces[row.feedback_mood - 1]}` : ''}
                    </p>
                    <p className="text-sm text-neutral-700 mt-0.5">{visit_label(row.intern_date, row.intern_time)}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {format_phone_display(row.phone)} · {row.city}
                    </p>
                    {quiz_line(row.quiz_results) ? (
                      <p className="text-xs text-neutral-600 mt-1">{quiz_line(row.quiz_results)}</p>
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
                  </button>
                  <a
                    href={`tel:${row.phone}`}
                    className="shrink-0 text-sm text-highlight px-3 py-1.5 rounded-lg border border-surface"
                  >
                    позвонить
                  </a>
                </div>

                {opened ? (
                  <div className="mt-4 space-y-3 border-t border-neutral-100 pt-3 text-sm">
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
                    {row.quiz_results.length > 0 ? (
                      <div className="rounded-xl bg-neutral-50 p-3 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">тесты</p>
                        {row.quiz_results.map((block) => (
                          <QuizBlock key={block.id} block={block} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-neutral-400">тесты ещё не пришли</p>
                    )}

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
    </div>
  );
}
