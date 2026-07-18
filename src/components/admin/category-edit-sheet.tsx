'use client';

import { createElement, useEffect, useState } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';
import type { heading_style } from '@/lib/heading-style';
import { get_category_heading_style, set_category_heading_style } from '@/lib/menu-store';

type props = {
  category: string | null;
  item_count: number;
  on_close: () => void;
  on_rename: (old_name: string, new_name: string) => void;
  on_delete: (name: string) => void;
};

export default function category_edit_sheet({
  category,
  item_count,
  on_close,
  on_rename,
  on_delete,
}: props) {
  const [heading_style, set_heading_style] = useState<heading_style>('soft');

  useEffect(() => {
    if (category) set_heading_style(get_category_heading_style(category));
  }, [category]);

  if (!category) return null;

  return createElement(admin_sheet, {
    open: true,
    title: 'категория меню',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value;
          set_category_heading_style(category, heading_style);
          on_rename(category, input);
          on_close();
        }}
        className="space-y-3"
      >
        <input
          name="name"
          defaultValue={category}
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm capitalize"
          required
        />
        <p className="text-xs text-neutral-500">{item_count} позиций в категории</p>

        <fieldset className="space-y-2 rounded-xl border border-surface bg-surface/40 p-3">
          <legend className="px-1 text-xs font-medium text-neutral-500">тип заголовка</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white/70">
            <input
              type="radio"
              name="heading_style"
              checked={heading_style === 'soft'}
              onChange={() => set_heading_style('soft')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-bold text-neutral-900">мягкий</span>
              <span className="block text-xs text-neutral-500">
                простой rounded sans — сочетается с лого и наборным
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-white/70">
            <input
              type="radio"
              name="heading_style"
              checked={heading_style === 'playful'}
              onChange={() => set_heading_style('playful')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-bold text-neutral-900">игровой</span>
              <span className="block text-xs text-neutral-500">
                рукописный script (Caveat) — акцент на категории
              </span>
            </span>
          </label>
        </fieldset>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (confirm(`удалить «${category}» и все блюда?`)) {
                on_delete(category);
                on_close();
              }
            }}
            className="rounded-pill border border-surface px-4 py-2.5 text-sm text-accent"
          >
            удалить
          </button>
          <button
            type="button"
            onClick={on_close}
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
    ),
  });
}
