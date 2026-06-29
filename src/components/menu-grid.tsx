'use client';

import { createElement } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';

type props = {
  items: menu_item[];
  categories: string[];
  on_item_click: (item: menu_item) => void;
  active_category?: string;
};

const cols = 4;

/** высота h2 + отступ до сетки на desktop (выравнивание рекламы с карточками) */
export const desktop_category_heading_offset = '3.25rem';

function pad_row(list: menu_item[]): (menu_item | null)[] {
  const out: (menu_item | null)[] = [...list];
  const rem = out.length % cols;
  if (rem > 0) {
    for (let i = 0; i < cols - rem; i++) out.push(null);
  }
  return out;
}

function dish_card({
  item,
  on_item_click,
}: {
  item: menu_item;
  on_item_click: (item: menu_item) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => on_item_click(item)}
      className="group flex h-full w-full flex-col items-center text-center"
    >
      <div className="aspect-square w-full mb-2 rounded-card overflow-hidden">
        {createElement(menu_image, {
          item,
          className: 'w-full h-full',
          variant: 'card',
        })}
      </div>
      <p className="font-bold text-[15px] leading-snug text-neutral-900 w-full px-1 mb-2 min-h-[2.75rem] max-h-[2.75rem] line-clamp-2 group-hover:text-accent transition-colors">
        {item.name}
      </p>
      <span className="mt-auto inline-flex rounded-pill bg-surface px-4 py-2 text-sm font-medium text-neutral-900 group-hover:bg-surface/80 transition-colors">
        {item.price} ₽
      </span>
    </button>
  );
}

function empty_cell(key: string) {
  return (
    <div key={key} aria-hidden className="pointer-events-none invisible">
      <div className="aspect-square w-full mb-2" />
      <p className="min-h-[2.75rem] mb-2" />
      <span className="inline-flex px-4 py-2 text-sm">0 ₽</span>
    </div>
  );
}

export default function menu_grid({
  items,
  categories,
  on_item_click,
  active_category,
}: props) {
  const visible_categories = active_category
    ? [active_category]
    : categories.filter((cat) => items.some((i) => i.category === cat && i.is_available));

  if (visible_categories.length === 0) {
    return (
      <p className="text-center text-neutral-400 py-16 text-sm">
        в этой категории пока нет позиций
      </p>
    );
  }

  return (
    <div className="space-y-8 sm:space-y-10">
      {visible_categories.map((category) => {
        const cat_items = items.filter(
          (i) => i.category === category && i.is_available
        );
        if (!cat_items.length) {
          if (active_category) {
            return (
              <p key={category} className="text-center text-neutral-400 py-16 text-sm">
                в категории «{category}» пока нет позиций
              </p>
            );
          }
          return null;
        }

        const desktop_cells = pad_row(cat_items);

        return (
          <section
            key={category}
            id={`cat-${encodeURIComponent(category)}`}
            className="scroll-mt-36 sm:scroll-mt-40"
          >
            {!active_category && (
              <h2 className="font-display text-xl sm:text-2xl font-bold mb-4 sm:mb-5">{category}</h2>
            )}

            <div className="grid grid-cols-2 gap-2 gap-y-5 min-[1024px]:hidden">
              {cat_items.map((item) => (
                <div key={item.id}>{createElement(dish_card, { item, on_item_click })}</div>
              ))}
            </div>

            <div className="hidden min-[1024px]:grid min-[1024px]:grid-cols-4 min-[1024px]:gap-2 min-[1024px]:gap-y-5">
              {desktop_cells.map((item, idx) =>
                item ? (
                  <div key={item.id} className="min-w-0">
                    {createElement(dish_card, { item, on_item_click })}
                  </div>
                ) : (
                  empty_cell(`empty-${category}-${idx}`)
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
