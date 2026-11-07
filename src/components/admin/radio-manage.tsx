'use client';

import { useEffect, useRef, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';

type radio_track = {
  id: string;
  url: string;
  title: string;
  source?: 'file';
};

/** меньше 1 МБ — столько nginx пропускает без настройки */
const chunk_size = 900 * 1024;

function new_upload_id() {
  return `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetch_radio() {
  const res = await fetch('/api/admin/radio', { credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as { tracks?: radio_track[]; error?: string };
  return { ok: res.ok, data };
}

export default function RadioManage() {
  const [tracks, set_tracks] = useState<radio_track[]>([]);
  const [url, set_url] = useState('');
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [uploading, set_uploading] = useState('');
  const [error, set_error] = useState('');
  const [note, set_note] = useState('');
  const file_input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch_radio()
      .then(({ ok, data }) => {
        if (!ok) {
          set_error(data.error || 'нет доступа');
          return;
        }
        set_tracks(data.tracks || []);
        set_error('');
      })
      .catch(() => set_error('ошибка сети'))
      .finally(() => set_loading(false));
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

  async function upload_one(file: File, label: string) {
    const id = new_upload_id();
    let offset = 0;
    let last: radio_track[] | null = null;
    while (offset < file.size) {
      const piece = file.slice(offset, offset + chunk_size);
      const query = new URLSearchParams({ id, offset: String(offset), total: String(file.size), name: file.name });
      set_uploading(`${label} · ${Math.floor((offset / file.size) * 100)}%`);
      const res = await fetch(`/api/admin/radio/upload?${query}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/octet-stream' },
        body: piece,
      });
      const data = (await res.json().catch(() => ({}))) as {
        received?: number;
        tracks?: radio_track[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'не загрузилось');
      offset = data.received ?? offset + piece.size;
      if (data.tracks) last = data.tracks;
    }
    if (last) set_tracks(last);
  }

  async function add_files(list: FileList | null) {
    const files = Array.from(list || []);
    if (file_input.current) file_input.current.value = '';
    if (!files.length || uploading) return;
    set_error('');
    set_note('');
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      const label = files.length > 1 ? `${index + 1} из ${files.length} · ${file.name}` : file.name;
      try {
        await upload_one(file, label);
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : 'не загрузилось'}`);
      }
    }
    set_uploading('');
    const done = files.length - failed.length;
    if (done) set_note(done > 1 ? `загрузил ${done}` : 'загрузил');
    if (failed.length) set_error(failed.join(' · '));
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
        в источник попадает ролик по ссылке или свой файл. касса скачивает запись на устройство и играет уже оттуда.
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
        <div className="mt-4 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-100" />
          или
          <span className="h-px flex-1 bg-neutral-100" />
        </div>
        <input
          ref={file_input}
          type="file"
          accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.wma,.aiff,.mp4,.mov,.webm,.mkv"
          multiple
          className="hidden"
          onChange={(e) => void add_files(e.target.files)}
        />
        <button
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => file_input.current?.click()}
          className="mt-4 w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-60"
        >
          {uploading ? `загружаю ${uploading}` : 'загрузить файлы'}
        </button>
        <p className="mt-2 text-xs text-neutral-400">любой аудио или видео файл, можно сразу несколько — сервер сам сделает mp3</p>
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
                  <p className="truncate text-xs text-neutral-400">
                    {track.source === 'file' ? `файл · ${track.url.slice(5)}` : track.url}
                  </p>
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
