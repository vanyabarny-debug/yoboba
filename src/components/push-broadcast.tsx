'use client';

import { useEffect, useState } from 'react';

type row = {
  id: string;
  label: string;
  hint: string;
  people: number;
  devices: number;
};

/** рассылка по категориям: числа есть, имён и телефонов нет */
export default function push_broadcast() {
  const [rows, set_rows] = useState<row[]>([]);
  const [picked, set_picked] = useState<string[]>([]);
  const [people, set_people] = useState(0);
  const [title, set_title] = useState('');
  const [text, set_text] = useState('');
  const [error, set_error] = useState('');
  const [sending, set_sending] = useState(false);
  const [result, set_result] = useState('');

  useEffect(() => {
    const q = picked.length ? `?pick=${encodeURIComponent(picked.join(','))}` : '';
    let stop = false;
    fetch(`/api/push/categories${q}`, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((body: { categories?: row[]; people?: number; error?: string }) => {
        if (stop) return;
        if (body.error) {
          set_error(body.error);
          return;
        }
        set_error('');
        set_rows(body.categories || []);
        set_people(body.people || 0);
      })
      .catch(() => {
        if (!stop) set_error('не удалось посчитать категории');
      });
    return () => {
      stop = true;
    };
  }, [picked]);

  function toggle(id: string) {
    set_result('');
    set_picked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    set_sending(true);
    set_result('');
    set_error('');
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          body: text,
          url: '/',
          audience: 'categories',
          categories: picked,
        }),
      });
      const json = (await res.json()) as { sent?: number; total?: number; people?: number; error?: string };
      if (!res.ok) {
        set_error(json.error || 'не отправилось');
        return;
      }
      set_result(`ушло ${json.sent ?? 0} из ${json.total ?? 0} устройств · ${json.people ?? people} человек`);
      set_title('');
      set_text('');
    } catch {
      set_error('не отправилось');
    } finally {
      set_sending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex h-full flex-col gap-3 overflow-y-auto px-1">
      <div>
        <p className="text-sm font-semibold text-neutral-900">рассылка</p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
          только категории. имена и телефоны здесь не показываются, базу клиентов не открыть
        </p>
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const on = picked.includes(row.id);
          return (
            <li key={row.id}>
              <label className="flex items-start gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={on}
                  onChange={() => toggle(row.id)}
                />
                <span className="min-w-0">
                  <span className="block text-neutral-900">{row.label}</span>
                  <span className="block text-[11px] text-neutral-400">
                    {row.hint} · {row.people} чел.
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-neutral-500">
        {picked.length
          ? `уйдёт ${people} чел. кто именно — не показывается`
          : 'выберите категорию'}
      </p>
      <label className="block">
        <span className="text-xs text-neutral-500">заголовок</span>
        <input
          value={title}
          onChange={(e) => set_title(e.target.value)}
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs text-neutral-500">текст</span>
        <textarea
          value={text}
          onChange={(e) => set_text(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          required
        />
      </label>
      <button
        type="submit"
        disabled={sending || !picked.length}
        className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {sending ? 'отправляю…' : 'отправить'}
      </button>
      {result ? <p className="text-sm text-neutral-700">{result}</p> : null}
    </form>
  );
}
