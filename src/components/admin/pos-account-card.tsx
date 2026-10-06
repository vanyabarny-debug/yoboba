'use client';

import { useEffect, useState } from 'react';

export default function pos_account_card() {
  const [login, set_login] = useState('');
  const [current_password, set_current_password] = useState('');
  const [new_password, set_new_password] = useState('');
  const [repeat_password, set_repeat_password] = useState('');
  const [loading, set_loading] = useState(true);
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState('');
  const [saved, set_saved] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/pos-account', { credentials: 'same-origin' });
        const data = (await res.json().catch(() => ({}))) as { login?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          set_error(data.error || 'не удалось загрузить вход кассы');
          return;
        }
        set_login(data.login || 'kassa');
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
      const res = await fetch('/api/admin/pos-account', {
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
      set_saved('сохранено · этим логином открывают кассу на точке');
    } catch {
      set_error('ошибка сети');
    } finally {
      set_saving(false);
    }
  }

  return (
    <form
      onSubmit={handle_save}
      className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3"
    >
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">общий вход в кассу</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          один логин на устройство · внутри уже выбирают бариста своим паролем
        </p>
        <p className="text-[11px] text-neutral-400 mt-1">
          по умолчанию: kassa / kassa
        </p>
      </div>
      <label className="block">
        <span className="text-xs text-neutral-600">логин кассы</span>
        <input
          type="text"
          value={login}
          onChange={(e) => set_login(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs text-neutral-600">текущий пароль</span>
        <input
          type="password"
          value={current_password}
          onChange={(e) => set_current_password(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
          required
        />
      </label>
      <label className="block">
        <span className="text-xs text-neutral-600">новый пароль</span>
        <input
          type="password"
          value={new_password}
          onChange={(e) => set_new_password(e.target.value)}
          autoComplete="new-password"
          placeholder="пусто — оставить"
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="text-xs text-neutral-600">новый пароль ещё раз</span>
        <input
          type="password"
          value={repeat_password}
          onChange={(e) => set_repeat_password(e.target.value)}
          autoComplete="new-password"
          className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={saving || loading}
        className="w-full rounded-xl bg-neutral-900 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? 'сохраняю...' : 'сохранить вход кассы'}
      </button>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600">{saved}</p> : null}
    </form>
  );
}
