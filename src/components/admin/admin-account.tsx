'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/admin-shell';

type login_event = {
  id: string;
  at: string;
  device: string;
  browser: string;
  ip: string;
};

function format_when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAccount() {
  const [login, set_login] = useState('');
  const [current_password, set_current_password] = useState('');
  const [new_password, set_new_password] = useState('');
  const [repeat_password, set_repeat_password] = useState('');
  const [logins, set_logins] = useState<login_event[]>([]);
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState('');
  const [saved, set_saved] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/account', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as { login?: string; logins?: login_event[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          set_error(data.error || 'не удалось открыть аккаунт');
          return;
        }
        set_login(data.login || '');
        set_logins(data.logins || []);
      } catch {
        if (!cancelled) set_error('ошибка сети');
      } finally {
        if (!cancelled) set_loading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handle_save(e: React.FormEvent) {
    e.preventDefault();
    set_error('');
    set_saved('');
    if (new_password && new_password !== repeat_password) {
      set_error('новый пароль и повтор не совпадают');
      return;
    }
    set_saving(true);
    try {
      const res = await fetch('/api/admin/account', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          current_password,
          login,
          new_password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { login?: string; error?: string };
      if (!res.ok) {
        set_error(data.error || 'не сохранилось');
        return;
      }
      set_login(data.login || login);
      set_current_password('');
      set_new_password('');
      set_repeat_password('');
      set_saved('сохранено. в следующий раз входи уже с этими данными');
    } catch {
      set_error('ошибка сети');
    } finally {
      set_saving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="font-heading-soft text-xl text-neutral-900">аккаунт</h1>
      <p className="mt-1 text-sm text-neutral-500">логин, пароль и с каких устройств входили в админку</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <form onSubmit={handle_save} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-900">сменить вход</h2>
          <label className="block">
            <span className="text-sm text-neutral-600">логин</span>
            <input
              type="text"
              value={login}
              onChange={(e) => set_login(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-600">текущий пароль</span>
            <input
              type="password"
              value={current_password}
              onChange={(e) => set_current_password(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-600">новый пароль</span>
            <input
              type="password"
              value={new_password}
              onChange={(e) => set_new_password(e.target.value)}
              autoComplete="new-password"
              placeholder="пусто — оставить как есть"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
            />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-600">новый пароль ещё раз</span>
            <input
              type="password"
              value={repeat_password}
              onChange={(e) => set_repeat_password(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
            />
          </label>
          <button
            type="submit"
            disabled={saving || loading}
            className="w-full rounded-xl bg-accent text-accent-foreground py-3 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'сохраняю...' : 'сохранить'}
          </button>
          {error && <p className="text-sm text-accent">{error}</p>}
          {saved && <p className="text-sm text-emerald-600">{saved}</p>}
        </form>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">входы</h2>
          {loading ? (
            <p className="mt-4 text-sm text-neutral-400">загрузка...</p>
          ) : logins.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-400">пока пусто — запись появится после следующего входа</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {logins.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <div>
                    <p className="text-sm text-neutral-900">
                      {row.device}
                      <span className="text-neutral-400"> · {row.browser}</span>
                    </p>
                    <p className="text-xs text-neutral-400">{row.ip}</p>
                  </div>
                  <p className="text-sm tabular-nums text-neutral-500">{format_when(row.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
