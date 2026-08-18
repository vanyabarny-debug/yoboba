'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { menu_item } from '@/lib/types';
import {
  add_category,
  delete_category,
  delete_menu_item,
  get_menu_store,
  new_item_id,
  subscribe_menu_store,
  upsert_menu_item,
} from '@/lib/menu-store';
import AdminShell from '@/components/admin/admin-shell';
import menu_image from '@/components/menu-image';
import { product_photo_button } from '@/components/admin/product-photo-picker';
import { item_has_toppings, item_has_volumes } from '@/lib/cart-summary';

function toggle_row({
  label,
  hint,
  on,
  on_change,
}: {
  label: string;
  hint?: string;
  on: boolean;
  on_change: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => on_change(!on)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-neutral-900">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? 'bg-neutral-900' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function editor({
  item,
  items,
  categories,
  on_close,
  on_save,
  on_delete,
}: {
  item: menu_item;
  items: menu_item[];
  categories: string[];
  on_close: () => void;
  on_save: (item: menu_item) => void;
  on_delete: (id: string) => void;
}) {
  const [draft, set_draft] = useState<menu_item>(item);
  const others = items.filter((i) => i.id !== item.id);

  useEffect(() => {
    set_draft({ ...item });
  }, [item]);

  function toggle_rec(id: string) {
    const next = draft.recommendations.includes(id)
      ? draft.recommendations.filter((x) => x !== id)
      : [...draft.recommendations, id].slice(0, 8);
    set_draft({ ...draft, recommendations: next });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <button type="button" aria-label="закрыть" className="absolute inset-0 bg-black/35" onClick={on_close} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-neutral-900">карточка</h3>
          <button type="button" onClick={on_close} className="text-sm text-neutral-400">
            закрыть
          </button>
        </div>

        <div className="mt-4 flex gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-100">
            {createElement(menu_image, { item: draft, className: 'h-full w-full', variant: 'card' })}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {createElement(product_photo_button, {
              label: 'фото',
              on_save: (url) => set_draft({ ...draft, image_url: url }),
              className: 'w-full',
            })}
            <p className="text-xs text-neutral-400">квадрат, лучше без фона</p>
          </div>
        </div>

        <label className="mt-5 block text-xs text-neutral-500">
          название
          <input
            value={draft.name}
            onChange={(e) => set_draft({ ...draft, name: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-200"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-500">
            цена, ₽
            <input
              type="number"
              min={0}
              value={draft.price}
              onChange={(e) => set_draft({ ...draft, price: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-200"
            />
          </label>
          <label className="block text-xs text-neutral-500">
            категория
            <select
              value={draft.category}
              onChange={(e) => set_draft({ ...draft, category: e.target.value })}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-2">
          {toggle_row({
            label: 'в меню',
            hint: 'выключить — позиция в стопе',
            on: draft.is_available,
            on_change: (on) => set_draft({ ...draft, is_available: on }),
          })}
          {toggle_row({
            label: 'объёмы 450 / 650 мл',
            hint: 'если выключить — гость берёт как есть',
            on: item_has_volumes(draft),
            on_change: (on) => set_draft({ ...draft, has_volumes: on }),
          })}
          {toggle_row({
            label: 'топпинг',
            hint: 'добавки порциями в карточке товара',
            on: item_has_toppings(draft),
            on_change: (on) => set_draft({ ...draft, has_toppings: on }),
          })}
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-neutral-500">похожее · хорошо сочетается</p>
          <p className="mt-1 text-xs text-neutral-400">до 8 позиций, покажутся в карточке</p>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-neutral-200 p-2">
            {others.map((other) => {
              const on = draft.recommendations.includes(other.id);
              return (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => toggle_rec(other.id)}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${
                    on ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                    {createElement(menu_image, {
                      item: other,
                      className: 'h-full w-full',
                      variant: 'thumb',
                    })}
                  </span>
                  <span className="min-w-0 truncate">{other.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm(`удалить «${draft.name}»?`)) on_delete(draft.id);
            }}
            className="rounded-pill border border-neutral-200 px-4 py-3 text-sm text-red-500"
          >
            удалить
          </button>
          <button
            type="button"
            onClick={() =>
              on_save({
                ...draft,
                name: draft.name.trim() || 'без названия',
                price: Math.max(0, Math.round(draft.price)),
              })
            }
            className="flex-1 rounded-pill bg-neutral-900 py-3 text-sm font-semibold text-white"
          >
            сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default function menu_settings() {
  const [categories, set_categories] = useState<string[]>([]);
  const [items, set_items] = useState<menu_item[]>([]);
  const [category, set_category] = useState<string>('все');
  const [query, set_query] = useState('');
  const [selected, set_selected] = useState<menu_item | null>(null);

  function reload() {
    const store = get_menu_store();
    set_categories(store.categories);
    set_items(store.items);
  }

  useEffect(() => {
    reload();
    return subscribe_menu_store(reload);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'все' && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, category, query]);

  function handle_add() {
    const cat = category === 'все' ? categories[0] : category;
    if (!cat) return;
    const created: menu_item = {
      id: new_item_id(),
      name: 'новая позиция',
      price: 0,
      image_url: null,
      category: cat,
      is_available: true,
      recommendations: [],
      prep_minutes: 2,
      has_volumes: true,
      has_toppings: true,
    };
    upsert_menu_item(created);
    reload();
    set_selected(created);
  }

  return (
    <AdminShell>
      <div className="max-w-3xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">меню</h1>
            <p className="mt-1 text-sm text-neutral-500">
              название, фото, объём, топпинг и похожие
            </p>
          </div>
          <button
            type="button"
            onClick={handle_add}
            className="rounded-pill bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            добавить
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {['все', ...categories].map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => set_category(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                  active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 border border-neutral-200'
                }`}
              >
                {c}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const name = prompt('название категории');
              if (!name?.trim()) return;
              add_category(name.trim());
              reload();
              set_category(name.trim().toLowerCase());
            }}
            className="shrink-0 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-400"
          >
            + категория
          </button>
        </div>

        {category !== 'все' && (
          <button
            type="button"
            onClick={() => {
              if (!confirm(`удалить категорию «${category}» и её блюда?`)) return;
              delete_category(category);
              set_category('все');
              reload();
            }}
            className="mt-2 text-xs text-neutral-400 hover:text-red-500"
          >
            удалить эту категорию
          </button>
        )}

        <input
          type="search"
          value={query}
          onChange={(e) => set_query(e.target.value)}
          placeholder="найти позицию"
          className="mt-4 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none"
        />

        <ul className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {visible.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-neutral-400">пусто</li>
          )}
          {visible.map((item) => (
            <li key={item.id} className="border-t border-neutral-100 first:border-t-0">
              <button
                type="button"
                onClick={() => set_selected(item)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-neutral-50"
              >
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {createElement(menu_image, { item, className: 'h-full w-full', variant: 'thumb' })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900">{item.name}</span>
                  <span className="mt-0.5 block text-xs text-neutral-400">
                    {item.category}
                    {!item.is_available ? ' · стоп' : ''}
                    {!item_has_volumes(item) ? ' · без объёма' : ''}
                    {!item_has_toppings(item) ? ' · без топпинга' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-neutral-700">{item.price} ₽</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected &&
        createElement(editor, {
          item: selected,
          items,
          categories,
          on_close: () => set_selected(null),
          on_save: (next) => {
            upsert_menu_item(next);
            reload();
            set_selected(null);
          },
          on_delete: (id) => {
            delete_menu_item(id);
            reload();
            set_selected(null);
          },
        })}
    </AdminShell>
  );
}
