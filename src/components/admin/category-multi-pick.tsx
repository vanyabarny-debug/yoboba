'use client';

import { useState } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { field_class } from '@/components/admin/finance/ui';
import { item_categories, item_in_category, set_item_categories } from '@/lib/menu-item-categories';
import { add_category } from '@/lib/menu-store';
import type { menu_item } from '@/lib/types';

export default function category_multi_pick({
  item,
  categories,
  on_change,
  on_catalog_change,
}: {
  item: menu_item;
  categories: string[];
  on_change: (item: menu_item) => void;
  on_catalog_change?: () => void;
}) {
  const [open, set_open] = useState(false);
  const [extra, set_extra] = useState<string[]>([]);
  const [name, set_name] = useState('');
  const selected = item_categories(item);
  const all = [...categories, ...extra.filter((c) => !categories.includes(c))];

  function toggle(c: string) {
    const on = item_in_category(item, c);
    const next = on ? selected.filter((x) => x !== c) : [...selected, c];
    if (next.length === 0) return;
    on_change(set_item_categories(item, next));
  }

  function create_named() {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    add_category(trimmed);
    on_catalog_change?.();
    set_extra((prev) => (prev.includes(trimmed) || categories.includes(trimmed) ? prev : [...prev, trimmed]));
    if (!selected.includes(trimmed)) on_change(set_item_categories(item, [...selected, trimmed]));
    set_name('');
  }

  return (
    <div>
      <p className="text-xs text-neutral-500">категории</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {selected.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            className="rounded-full bg-neutral-900 px-3 py-1.5 text-sm capitalize text-white"
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          aria-label="добавить категорию"
          onClick={() => set_open(true)}
          className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-lg leading-none text-neutral-500"
        >
          +
        </button>
      </div>
      {admin_sheet({
        open,
        title: 'категории',
        on_close: () => set_open(false),
        children: (
          <div>
            <p className="mb-3 text-[11px] leading-snug text-neutral-400">
              можно отметить несколько — напиток появится в каждом разделе
            </p>
            <div className="flex flex-wrap gap-1.5">
              {all.map((c) => {
                const on = item_in_category(item, c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    className={`rounded-full px-3 py-1.5 text-sm capitalize transition-colors ${
                      on
                        ? 'bg-neutral-900 text-white'
                        : 'border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                create_named();
              }}
            >
              <input
                value={name}
                onChange={(e) => set_name(e.target.value)}
                placeholder="новая категория"
                className={field_class}
              />
              <button
                type="submit"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-900 text-lg leading-none text-white"
                aria-label="добавить категорию"
              >
                +
              </button>
            </form>
          </div>
        ),
      })}
    </div>
  );
}
