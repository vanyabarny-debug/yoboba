'use client';

import { item_categories, item_in_category, set_item_categories } from '@/lib/menu-item-categories';
import type { menu_item } from '@/lib/types';

export default function category_multi_pick({
  item,
  categories,
  on_change,
}: {
  item: menu_item;
  categories: string[];
  on_change: (item: menu_item) => void;
}) {
  const selected = item_categories(item);

  return (
    <div>
      <p className="text-xs text-neutral-500">категории</p>
      <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">
        можно отметить несколько — напиток появится в каждом разделе
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const on = item_in_category(item, c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                const next = on ? selected.filter((x) => x !== c) : [...selected, c];
                if (next.length === 0) return;
                on_change(set_item_categories(item, next));
              }}
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
    </div>
  );
}
