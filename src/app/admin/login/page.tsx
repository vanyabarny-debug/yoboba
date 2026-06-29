'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { create_demo_user } from '@/lib/demo-auth';

export default function admin_login_page() {
  const router = useRouter();
  const [login, set_login] = useState('');
  const [password, set_password] = useState('');
  const [loading, set_loading] = useState(false);
  const [error, set_error] = useState('');

  async function handle_submit(e: React.FormEvent) {
    e.preventDefault();
    set_loading(true);
    set_error('');

    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });

    set_loading(false);

    if (!res.ok) {
      set_error('неверный логин или пароль');
      return;
    }

    create_demo_user({ name: 'админ', role: 'admin' });
    router.push('/admin/menu');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-surface flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-4 py-3">
        <Link href="/" className="text-sm text-neutral-500">
          ← на сайт
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold">вход для персонала</h1>
            <p className="text-sm text-neutral-500 mt-2">управление меню и заказами</p>
          </div>

          <form
            onSubmit={handle_submit}
            className="bg-white rounded-2xl border border-surface p-6 shadow-soft space-y-4"
          >
            <label className="block">
              <span className="text-sm text-neutral-600">логин</span>
              <input
                type="text"
                value={login}
                onChange={(e) => set_login(e.target.value)}
                autoComplete="username"
                className="mt-1 w-full rounded-xl border border-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
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
                className="mt-1 w-full rounded-xl border border-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-highlight"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent text-white py-3.5 font-semibold disabled:opacity-50"
            >
              {loading ? 'входим...' : 'войти'}
            </button>
            {error && <p className="text-sm text-accent text-center">{error}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
