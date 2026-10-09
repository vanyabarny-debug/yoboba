'use client';

import { useEffect, useState } from 'react';
import type { cash_transaction, seller, store_spot } from '@/lib/types';
import AdminShell from '@/components/admin/admin-shell';
import { get_spots, subscribe_spot_store } from '@/lib/spot-store';
import {
  default_seller_access,
  parse_seller_access,
  seller_right_ids,
  seller_right_label,
  type seller_access,
} from '@/lib/seller-access';
import PosAccountCard from '@/components/admin/pos-account-card';

function new_seller_id() {
  return `seller-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function format_rub(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

type cash_stats = {
  orders: number;
  revenue: number;
  month_orders: number;
  month_revenue: number;
};

function empty_form() {
  return {
    login: '',
    password: '',
    name: '',
    role_title: 'бариста',
    spot_ids: [] as string[],
    access: default_seller_access(),
    salary_net: 0,
    with_ndfl: true,
  };
}

export default function sellers_manage({ bare = false }: { bare?: boolean } = {}) {
  const [sellers, set_sellers] = useState<seller[]>([]);
  const [spots, set_spots] = useState<store_spot[]>([]);
  const [editing, set_editing] = useState<seller | null>(null);
  const [form, set_form] = useState(empty_form());
  const [stats, set_stats] = useState<cash_stats | null>(null);
  const [stats_loading, set_stats_loading] = useState(false);
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

  useEffect(() => {
    if (!editing?.id || !sellers.some((s) => s.id === editing.id)) {
      set_stats(null);
      return;
    }
    let cancelled = false;
    set_stats_loading(true);
    fetch(`/api/cash?seller_id=${encodeURIComponent(editing.id)}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body: { transactions?: cash_transaction[] }) => {
        if (cancelled) return;
        const txs = (body.transactions ?? []).filter((t) => t.payment_method !== 'bonus');
        const month_prefix = new Date().toISOString().slice(0, 7);
        const month_txs = txs.filter((t) => (t.shift_date || '').startsWith(month_prefix));
        set_stats({
          orders: txs.length,
          revenue: txs.reduce((s, t) => s + (Number(t.order_total) || 0), 0),
          month_orders: month_txs.length,
          month_revenue: month_txs.reduce((s, t) => s + (Number(t.order_total) || 0), 0),
        });
      })
      .catch(() => {
        if (!cancelled) set_stats(null);
      })
      .finally(() => {
        if (!cancelled) set_stats_loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing?.id, sellers]);

  function open_create() {
    set_editing({
      id: new_seller_id(),
      login: '',
      password: '',
      name: '',
      is_active: true,
      created_at: '',
      role_title: 'бариста',
      spot_ids: [],
      salary_net: 0,
      with_ndfl: true,
    });
    set_form(empty_form());
    set_stats(null);
    set_error('');
  }

  function open_edit(s: seller) {
    set_editing(s);
    set_form({
      login: s.login,
      password: s.password,
      name: s.name,
      role_title: s.role_title?.trim() || 'бариста',
      spot_ids: s.spot_ids ?? [],
      access: parse_seller_access(s.access),
      salary_net: Math.max(0, Math.round(Number(s.salary_net) || 0)),
      with_ndfl: s.with_ndfl != null ? Boolean(s.with_ndfl) : (Number(s.salary_net) || 0) > 0,
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
          role_title: form.role_title,
          spot_ids: form.spot_ids,
          access: form.access,
          salary_net: form.salary_net,
          with_ndfl: form.with_ndfl,
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
    if (!confirm('удалить сотрудника?')) return;
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

  const body = (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{bare ? 'сотрудники' : 'персонал'}</h2>
        <p className="text-sm text-neutral-500">должность, ЗП и НДФЛ · привязка к точкам · касса</p>
      </div>

      <PosAccountCard />

      <button
        type="button"
        onClick={open_create}
        className="w-full rounded-xl bg-accent text-accent-foreground py-3 font-semibold text-sm"
      >
        + добавить сотрудника
      </button>

      {error && !editing && (
        <p className="text-sm text-accent text-center bg-white rounded-xl p-3 border border-surface">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400 text-center py-8">загрузка...</p>
      ) : sellers.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-8">сотрудников пока нет</p>
      ) : (
        <ul className="space-y-2">
          {sellers.map((s) => {
            const salary = Math.max(0, Math.round(Number(s.salary_net) || 0));
            return (
              <li
                key={s.id}
                className="bg-white rounded-xl border border-surface p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.role_title?.trim() || 'бариста'} {s.name}
                  </p>
                  <p className="text-xs text-neutral-500">логин: {s.login}</p>
                  {salary > 0 ? (
                    <p className="text-xs text-neutral-600 mt-1 tabular-nums">
                      зп {format_rub(salary)}
                      {s.with_ndfl !== false ? ' · ндфл' : ' · без ндфл'}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-400 mt-1">зп не задана</p>
                  )}
                  <p className="text-xs text-neutral-400 mt-1">
                    {seller_right_ids
                      .filter((id) => parse_seller_access(s.access)[id])
                      .map((id) => seller_right_label[id])
                      .join(' · ')}
                  </p>
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
            );
          })}
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
              {sellers.some((s) => s.id === editing.id) ? 'изменить сотрудника' : 'новый сотрудник'}
            </h2>
            <label className="block">
              <span className="text-sm text-neutral-600">должность</span>
              <input
                value={form.role_title}
                onChange={(e) => set_form({ ...form, role_title: e.target.value })}
                placeholder="бариста, менеджер"
                className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-sm"
                required
              />
            </label>
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

            <div className="rounded-xl border border-surface p-3 space-y-3">
              <p className="text-sm font-medium text-neutral-800">зарплата</p>
              <label className="block">
                <span className="text-sm text-neutral-600">на руки в месяц, ₽</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={form.salary_net || ''}
                  onChange={(e) =>
                    set_form({
                      ...form,
                      salary_net: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    })
                  }
                  placeholder="0"
                  className="mt-1 w-full rounded-xl border border-surface px-4 py-2.5 text-sm tabular-nums"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.with_ndfl}
                  onChange={(e) => set_form({ ...form, with_ndfl: e.target.checked })}
                  className="h-4 w-4 rounded border-neutral-300 text-accent"
                />
                платить ндфл с этой зп
              </label>
              <p className="text-[11px] text-neutral-400">попадёт в фот на панели финансов</p>
            </div>

            {sellers.some((s) => s.id === editing.id) ? (
              <div className="rounded-xl border border-surface p-3 space-y-1.5">
                <p className="text-sm font-medium text-neutral-800">касса</p>
                {stats_loading ? (
                  <p className="text-xs text-neutral-400">считаем…</p>
                ) : stats ? (
                  <>
                    <p className="text-sm tabular-nums text-neutral-800">
                      этот месяц · {stats.month_orders} зак. · {format_rub(stats.month_revenue)}
                    </p>
                    <p className="text-xs tabular-nums text-neutral-500">
                      всё время · {stats.orders} зак. · {format_rub(stats.revenue)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-neutral-400">пока нет продаж с кассы</p>
                )}
              </div>
            ) : null}

            <div>
              <p className="text-sm text-neutral-600 mb-2">что видит на кассе</p>
              <ul className="grid grid-cols-2 gap-1.5">
                {seller_right_ids.map((id) => (
                  <li key={id}>
                    <label className="flex items-center gap-2 rounded-xl border border-surface px-3 py-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.access[id]}
                        onChange={() =>
                          set_form((prev) => {
                            const access: seller_access = { ...prev.access, [id]: !prev.access[id] };
                            if (id === 'stock' && !access.stock) access.stock_money = false;
                            if (id === 'stock_money' && access.stock_money) access.stock = true;
                            return { ...prev, access };
                          })
                        }
                      />
                      <span>{seller_right_label[id]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

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
  );

  if (bare) return body;
  return <AdminShell>{body}</AdminShell>;
}
