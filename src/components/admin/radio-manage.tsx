'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';

type radio_track = {
  id: string;
  url: string;
  title: string;
};

export default function radio_manage() {
  const [tracks, set_tracks] = useState<radio_track[]>([]);
  const [url, set_url] = useState('');
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState('');
  const [note, set_note] = useState('');

  async function reload() {
    set_loading(true);
    try {
      const res = await fetch('/api/admin/radio', { credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { tracks?: radio_track[]; error?: string };
      if (!res.ok) {
        set_error(data.error || 'нет доступа');
        return;
      }
      set_tracks(data.tracks || []);
      set_error('');
    } catch {
      set_error('ошибка сети');
    } finally {
      set_loading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function add_link(e: React.FormEvent) {
    e.preventDefault();
    const next = url.trim();
    if (!next || saving) return;
    set_saving(true);
    set_error('');
    set_note('');
    try {
      const res = await fetch('/api/admin/radio', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        tracks?: radio_track[];
        added?: number;
        error?: string;
      };
      if (!res.ok) {
        set_error(data.error || 'не добавилось');
        return;
      }
      set_tracks(data.tracks || []);
      set_url('');
      set_note(data.added && data.added > 1 ? `добавил ${data.added}` : 'добавил');
    } catch {
      set_error('ошибка сети');
    } finally {
      set_saving(false);
    }
  }

  async function remove_track(id: string) {
    set_error('');
    set_note('');
    try {
      const res = await fetch('/api/admin/radio', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => ({}))) as { tracks?: radio_track[]; error?: string };
      if (!res.ok) {
        set_error(data.error || 'не убралось');
        return;
      }
      set_tracks(data.tracks || []);
    } catch {
      set_error('ошибка сети');
    }
  }

  return (
    <AdminShell>
      <h1 className="font-heading-soft text-xl text-neutral-900">музыка</h1>
      <p className="mt-1 text-sm text-neutral-500">
        в источник попадает один ролик по ссылке. касса скачивает его на устройство и играет уже оттуда.
      </p>

      <form onSubmit={(e) => void add_link(e)} className="mt-6 max-w-xl rounded-2xl border border-neutral-200 bg-white p-5">
        <label className="block">
          <span className="text-sm text-neutral-600">ссылка</span>
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => set_url(e.target.value)}
            placeholder="https://"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
            required
          />
        </label>
        <button
          type="submit"
          disabled={saving || !url.trim()}
          className="mt-4 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {saving ? 'открываю…' : 'добавить в источник'}
        </button>
        {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-emerald-600">{note}</p> : null}
      </form>

      <section className="mt-4 max-w-xl rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">источник</h2>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-400">загрузка…</p>
        ) : tracks.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">пока пусто</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {tracks.map((track, index) => (
              <li key={track.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-neutral-400">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-900">{track.title}</p>
                  <p className="truncate text-xs text-neutral-400">{track.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove_track(track.id)}
                  className="shrink-0 text-xs text-neutral-500"
                >
                  убрать
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
