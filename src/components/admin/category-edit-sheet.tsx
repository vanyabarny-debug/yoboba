'use client';

import { createElement } from 'react';
import { admin_sheet } from '@/components/admin/admin-sheet';

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
