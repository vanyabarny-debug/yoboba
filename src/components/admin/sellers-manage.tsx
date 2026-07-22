'use client';

import { useEffect, useState } from 'react';
import type { seller } from '@/lib/types';
import AdminShell from '@/components/admin/admin-shell';

function new_seller_id() {
  return `seller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function sellers_manage() {
  const [sellers, set_sellers] = useState<seller[]>([]);
  const [editing, set_editing] = useState<seller | null>(null);
  const [form, set_form] = useState({ login: '', password: '', name: '' });
  const [error, set_error] = useState('');
  const [saving, set_saving] = useState(false);
  const [loading, set_loading] = useState(true);

  async function reload() {
    set_loading(true);
    try {
      const res = await fetch('/api/sellers');
      if (!res.ok) throw new Error('нет доступа — войдите как админ');
      const data = (await res.json()) as { sellers: seller[] };
      set_sellers(data.sellers);
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'ошибка загрузки');
    } finally {
      set_loading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function open_create() {
    set_editing({
      id: new_seller_id(),
      login: '',
      password: '',
      name: '',
      is_active: true,
      created_at: '',
    });
    set_form({ login: '', password: '', name: '' });
    set_error('');
  }

  function open_edit(s: seller) {
    set_editing(s);
    set_form({ login: s.login, password: s.password, name: s.name });
    set_error('');
  }

  async function handle_save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    set_saving(true);
    set_error('');
    try {
      const res = await fetch('/api/sellers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...editing,
          login: form.login,
          password: form.password,
          name: form.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ошибка сохранения');
      set_editing(null);
      await reload();
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'ошибка сохранения');
    } finally {
      set_saving(false);
    }
  }

  async function handle_delete(id: string) {
    if (!confirm('удалить продавца?')) return;
    set_error('');
    try {
      const res = await fetch(`/api/sellers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'не удалось удалить');
      await reload();
    } catch (err) {
      set_error(err instanceof Error ? err.message : 'не удалось удалить');
    }
  }

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">персонал</h2>
          <p className="text-sm text-neutral-500">продавцы и доступ к кассе</p>
        </div>

        <button
          type="button"
          onClick={open_create}
          className="w-full rounded-xl bg-accent text-accent-foreground py-3 font-semibold text-sm"
        >
          + добавить продавца
        </button>

        {error && !editing && (
          <p className="text-sm text-accent text-center bg-white rounded-xl p-3 border border-surface">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-neutral-400 text-center py-8">загрузка...</p>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">продавцов пока нет</p>
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => (
              <li
                key={s.id}
                className="bg-white rounded-xl border border-surface p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-neutral-500">логин: {s.login}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => open_edit(s)}
                    className="text-sm text-highlight px-3 py-1.5 rounded-lg border border-surface"
                  >
                    изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => handle_delete(s.id)}
                    className="text-sm text-accent px-3 py-1.5 rounded-lg border border-surface"
                  >
                    удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <button
              type="button"
              aria-label="закрыть"
              className="absolute inset-0 bg-black/40"
              onClick={() => set_editing(null)}
            />
            <form
              onSubmit={handle_save}
              className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft space-y-4"
            >
              <h2 className="text-lg font-semibold">
                {sellers.some((s) => s.id === editing.id) ? 'изменить' : 'новый'} продавец
              </h2>
              <label className="block">
                <span className="text-sm text-neutral-600">имя</span>
                <input
                  value={form.name}
                  onChange={(e) => set_form({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-neutral-600">логин</span>
                <input
                  value={form.login}
                  onChange={(e) => set_form({ ...form, login: e.target.value })}
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-neutral-600">пароль</span>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => set_form({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-sm"
                  required
                />
              </label>
              {error && <p className="text-sm text-accent">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set_editing(null)}
                  className="flex-1 rounded-xl border border-surface py-2.5 text-sm"
                >
                  отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-accent text-accent-foreground py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'сохраняем...' : 'сохранить'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
