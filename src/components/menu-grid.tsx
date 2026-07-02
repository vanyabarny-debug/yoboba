'use client';

import { createElement } from 'react';
import type { menu_item, promo_banner } from '@/lib/types';
import menu_image from '@/components/menu-image';
import promo_inline from '@/components/promo-inline';

type props = {
  items: menu_item[];
  categories: string[];
  on_item_click: (item: menu_item) => void;
  on_quick_add?: (item: menu_item) => void;
  active_category?: string;
  promos?: promo_banner[];
  on_promo_click?: (promo: promo_banner) => void;
  inline_promos?: boolean;
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
  on_quick_add,
}: {
  item: menu_item;
  on_item_click: (item: menu_item) => void;
  on_quick_add?: (item: menu_item) => void;
}) {
  return (
    <div className="group flex h-full w-full flex-col items-center text-center">
      <button
        type="button"
        onClick={() => on_item_click(item)}
        className="flex w-full flex-col items-center text-center min-[1024px]:min-h-0 min-[1024px]:flex-1"
      >
        <div className="aspect-square w-full mb-2 rounded-card overflow-hidden">
          {createElement(menu_image, {
            item,
            className: 'w-full h-full',
            variant: 'card',
          })}
        </div>
        <p className="font-bold text-[15px] leading-snug text-neutral-900 w-full px-1 mb-1 line-clamp-2 min-[1024px]:mb-0 min-[1024px]:min-h-[2.75rem] group-hover:text-accent transition-colors">
          {item.name}
        </p>
      </button>
      <button
        type="button"
        onClick={() => (on_quick_add ? on_quick_add(item) : on_item_click(item))}
        className="mt-1 min-[1024px]:mt-2 shrink-0 inline-flex rounded-pill bg-surface px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-surface/80 transition-colors"
        aria-label={`добавить ${item.name} в корзину за ${item.price} рублей`}
      >
        {item.price} ₽
      </button>
    </div>
  );
}

function empty_cell(key: string) {
  return (
    <div key={key} aria-hidden className="pointer-events-none invisible">
      <div className="aspect-square w-full mb-2" />
      <p className="min-h-[2.75rem] mb-1 min-[1024px]:mb-2" />
      <span className="inline-flex px-4 py-2 text-sm">0 ₽</span>
    </div>
  );
}

export default function menu_grid({
  items,
  categories,
  on_item_click,
  on_quick_add,
  active_category,
  promos = [],
  on_promo_click,
  inline_promos = false,
}: props) {
  const visible_categories = active_category
    ? [active_category]
    : categories.filter((cat) => items.some((i) => i.category === cat && i.is_available));

  const active_promos = promos.filter((p) => p.is_active);
  const show_inline = inline_promos && !active_category && on_promo_click;

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
        const category_promos = show_inline
          ? active_promos.filter((p) => p.category === category)
          : [];

        return (
          <div key={category}>
            <section
              id={`cat-${encodeURIComponent(category)}`}
              className="scroll-mt-36 sm:scroll-mt-40"
            >
              {!active_category && (
                <h2 className="font-display text-xl sm:text-2xl font-bold mb-4 sm:mb-5">{category}</h2>
              )}

              <div className="grid grid-cols-2 min-[1024px]:grid-cols-4 gap-2 gap-y-5">
                {cat_items.map((item) => (
                  <div key={item.id} className="min-w-0 min-[1024px]:h-full">
                    {createElement(dish_card, { item, on_item_click, on_quick_add })}
                  </div>
                ))}
                {desktop_cells.slice(cat_items.length).map((_, idx) => (
                  <div key={`empty-${category}-${idx}`} className="hidden min-[1024px]:block">
                    {empty_cell(`empty-${category}-${idx}`)}
                  </div>
                ))}
              </div>
            </section>

            {category_promos.length > 0 &&
              createElement(promo_inline, {
                promos: category_promos,
                on_promo_click: on_promo_click!,
              })}
          </div>
        );
      })}
    </div>
  );
}
