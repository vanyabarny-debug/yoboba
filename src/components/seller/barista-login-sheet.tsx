'use client';

import { useState } from 'react';

export default function barista_login_sheet({
  title = 'кто на смене',
  subtitle = 'войдите своим логином и паролем',
  busy,
  error,
  allow_cancel,
  on_cancel,
  on_submit,
}: {
  title?: string;
  subtitle?: string;
  busy?: boolean;
  error?: string;
  allow_cancel?: boolean;
  on_cancel?: () => void;
  on_submit: (login: string, password: string) => void | Promise<void>;
}) {
  const [login, set_login] = useState('');
  const [password, set_password] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void on_submit(login.trim(), password);
        }}
      >
        <div>
          <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
          <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>
        </div>
        <label className="block">
          <span className="text-sm text-neutral-600">логин бариста</span>
          <input
            type="text"
            value={login}
            onChange={(e) => set_login(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => set_password(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
            required
          />
        </label>
        {error ? <p className="text-sm text-accent text-center">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent text-accent-foreground py-3.5 font-semibold disabled:opacity-50"
        >
          {busy ? 'входим...' : 'продолжить'}
        </button>
        {allow_cancel && on_cancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={on_cancel}
            className="w-full rounded-xl py-2 text-sm text-neutral-500"
          >
            отмена
          </button>
        ) : null}
      </form>
    </div>
  );
}
