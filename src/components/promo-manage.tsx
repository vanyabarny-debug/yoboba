'use client';

import { useEffect, useState } from 'react';
import type { promo_banner } from '@/lib/types';
import {
  delete_promo,
  get_promo_store,
  move_promo,
  new_promo_id,
  reset_promo_store,
  upsert_promo,
} from '@/lib/promo-store';

const empty_promo: promo_banner = {
  id: '',
  title: '',
  subtitle: '',
  badge: '',
  image_url: '',
  link_url: '',
  menu_id: null,
  category: null,
  is_active: true,
};

export default function promo_manage() {
  const [promos, set_promos] = useState<promo_banner[]>([]);
  const [editing, set_editing] = useState<promo_banner | null>(null);

  function reload() {
    set_promos(get_promo_store().promos);
  }

  useEffect(() => {
    reload();
  }, []);

  function handle_save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const payload: promo_banner = {
      ...editing,
      id: editing.id || new_promo_id(),
      title: editing.title.trim(),
      subtitle: editing.subtitle?.trim() || undefined,
      badge: editing.badge?.trim() || undefined,
      image_url: editing.image_url.trim(),
      link_url: editing.link_url?.trim() || undefined,
      menu_id: editing.menu_id?.trim() || null,
      category: editing.category?.trim() || null,
    };
    if (!payload.title || !payload.image_url) return;
    upsert_promo(payload);
    set_editing(null);
    reload();
  }

  return (
    <section className="bg-white rounded-card border border-surface p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold">плашки акций</h2>
          <p className="text-xs text-neutral-500 mt-0.5">горизонтальная лента на вкладке «все»</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm('сбросить акции к дефолту?')) {
                reset_promo_store();
                reload();
              }
            }}
            className="text-xs text-neutral-400 px-2 py-1"
          >
            сброс
          </button>
          <button
            type="button"
            onClick={() => set_editing({ ...empty_promo })}
            className="rounded-pill bg-accent text-accent-foreground px-4 py-2 text-sm font-medium"
          >
            + плашка
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {promos.map((promo) => (
          <li
            key={promo.id}
            className="flex items-center gap-3 bg-surface rounded-xl p-3 text-sm"
          >
            {promo.image_url && (
              <img
                src={promo.image_url}
                alt=""
                className="w-16 h-10 rounded-lg object-cover bg-cream flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{promo.title}</p>
              <p className="text-xs text-neutral-500 truncate">
                {promo.badge || 'без бейджа'}
                {promo.category ? ` · кат: ${promo.category}` : ''}
                {promo.menu_id ? ` · товар: ${promo.menu_id}` : ''}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  move_promo(promo.id, -1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => {
                  move_promo(promo.id, 1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                upsert_promo({ ...promo, is_active: !promo.is_active });
                reload();
              }}
              className={`text-xs px-2 py-1 rounded-pill ${
                promo.is_active
                  ? 'bg-accent/10 text-accent'
                  : 'bg-neutral-200 text-neutral-500'
              }`}
            >
              {promo.is_active ? 'вкл' : 'выкл'}
            </button>
            <button
              type="button"
              onClick={() => set_editing({ ...promo })}
              className="text-xs text-neutral-600"
            >
              edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`удалить «${promo.title}»?`)) {
                  delete_promo(promo.id);
                  reload();
                }
              }}
              className="text-xs text-accent"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/30"
            onClick={() => set_editing(null)}
          />
          <form
            onSubmit={handle_save}
            className="relative w-full md:max-w-md bg-white rounded-t-2xl md:rounded-card p-5 shadow-soft max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-semibold mb-4">
              {editing.id ? 'редактировать плашку' : 'новая плашка'}
            </h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-neutral-500">заголовок</span>
                <input
                  value={editing.title}
                  onChange={(e) => set_editing({ ...editing, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">подзаголовок</span>
                <input
                  value={editing.subtitle || ''}
                  onChange={(e) => set_editing({ ...editing, subtitle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">бейдж (от 250 ₽, акция…)</span>
                <input
                  value={editing.badge || ''}
                  onChange={(e) => set_editing({ ...editing, badge: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">url картинки</span>
                <input
                  value={editing.image_url}
                  onChange={(e) => set_editing({ ...editing, image_url: e.target.value })}
                  placeholder="/images/promos/promo1.svg"
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">ссылка (необяз.)</span>
                <input
                  value={editing.link_url || ''}
                  onChange={(e) => set_editing({ ...editing, link_url: e.target.value })}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">id товара (открыть карточку)</span>
                <input
                  value={editing.menu_id || ''}
                  onChange={(e) => set_editing({ ...editing, menu_id: e.target.value || null })}
                  placeholder="cb-1"
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">категория (фильтр меню)</span>
                <input
                  value={editing.category || ''}
                  onChange={(e) => set_editing({ ...editing, category: e.target.value || null })}
                  placeholder="матча"
                  className="mt-1 w-full rounded-xl border border-surface px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => set_editing(null)}
                className="flex-1 rounded-pill border border-surface py-2.5 text-sm"
              >
                отмена
              </button>
              <button
                type="submit"
                className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium"
              >
                сохранить
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
