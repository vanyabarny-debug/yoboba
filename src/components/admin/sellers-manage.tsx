'use client';

import { useEffect, useState } from 'react';
import type { seller, store_spot } from '@/lib/types';
import AdminShell from '@/components/admin/admin-shell';
import { get_spots, subscribe_spot_store } from '@/lib/spot-store';

function new_seller_id() {
  return `seller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function sellers_manage() {
  const [sellers, set_sellers] = useState<seller[]>([]);
  const [spots, set_spots] = useState<store_spot[]>([]);
  const [editing, set_editing] = useState<seller | null>(null);
  const [form, set_form] = useState({ login: '', password: '', name: '', spot_ids: [] as string[] });
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
    function reload_spots() {
      set_spots(get_spots());
    }
    reload_spots();
    return subscribe_spot_store(reload_spots);
  }, []);

  function open_create() {
    set_editing({
      id: new_seller_id(),
      login: '',
      password: '',
      name: '',
      is_active: true,
      created_at: '',
      spot_ids: [],
    });
    set_form({ login: '', password: '', name: '', spot_ids: [] });
    set_error('');
  }

  function open_edit(s: seller) {
    set_editing(s);
    set_form({
      login: s.login,
      password: s.password,
      name: s.name,
      spot_ids: s.spot_ids ?? [],
    });
    set_error('');
  }

  function toggle_spot(id: string) {
    set_form((prev) => ({
      ...prev,
      spot_ids: prev.spot_ids.includes(id)
        ? prev.spot_ids.filter((x) => x !== id)
        : [...prev.spot_ids, id],
    }));
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
          spot_ids: form.spot_ids,
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
    if (!confirm('удалить кассира?')) return;
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

  function spot_labels(ids?: string[]) {
    if (!ids?.length) return 'все точки';
    return ids
      .map((id) => spots.find((s) => s.id === id)?.address || id)
      .join(' · ');
  }

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">персонал</h2>
          <p className="text-sm text-neutral-500">бариста / касса · привязка к точкам</p>
        </div>

        <button
          type="button"
          onClick={open_create}
          className="w-full rounded-xl bg-accent text-accent-foreground py-3 font-semibold text-sm"
        >
          + добавить кассира
        </button>

        {error && !editing && (
          <p className="text-sm text-accent text-center bg-white rounded-xl p-3 border border-surface">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-neutral-400 text-center py-8">загрузка...</p>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8">кассиров пока нет</p>
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => (
              <li
                key={s.id}
                className="bg-white rounded-xl border border-surface p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">бариста {s.name}</p>
                  <p className="text-xs text-neutral-500">логин: {s.login}</p>
                  <p className="text-xs text-neutral-400 mt-1 truncate">{spot_labels(s.spot_ids)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
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
              className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-soft space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-semibold">
                {sellers.some((s) => s.id === editing.id) ? 'изменить' : 'новый'} кассир
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

              <div>
                <p className="text-sm text-neutral-600 mb-2">точки смены</p>
                <p className="text-[11px] text-neutral-400 mb-2">
                  пусто = может выбрать любую активную точку
                </p>
                <ul className="space-y-1.5">
                  {spots.map((spot) => (
                    <li key={spot.id}>
                      <label className="flex items-start gap-2 rounded-xl border border-surface px-3 py-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.spot_ids.includes(spot.id)}
                          onChange={() => toggle_spot(spot.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium block">{spot.address}</span>
                          <span className="text-xs text-neutral-400 capitalize">{spot.city}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

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
