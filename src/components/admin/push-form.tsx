'use client';

import { useState } from 'react';

export default function push_form() {
  const [title, set_title] = useState('');
  const [body, set_body] = useState('');
  const [loading, set_loading] = useState(false);
  const [result, set_result] = useState('');

  async function handle_send(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_result('');

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });

    const data = await res.json();
    set_loading(false);

    if (!res.ok) {
      set_result(data.error || 'ошибка отправки');
      return;
    }
    set_result(`отправлено: ${data.sent} из ${data.total}`);
    set_title('');
    set_body('');
  }

  return (
    <div className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <h3 className="font-semibold mb-3">пуш-рассылка</h3>
      <form onSubmit={handle_send} className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => set_title(e.target.value)}
          placeholder="заголовок"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
          required
        />
        <textarea
          value={body}
          onChange={(e) => set_body(e.target.value)}
          placeholder="текст уведомления"
          rows={3}
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm resize-none"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'отправляем...' : 'отправить подписчикам'}
        </button>
      </form>
      {result && <p className="text-xs text-neutral-500 mt-2">{result}</p>}
    </div>
  );
}
