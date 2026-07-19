'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { menu_item, promo_banner } from '@/lib/types';
import menu_image from '@/components/menu-image';
import { menu_badge_on_card } from '@/components/menu-badge';
import { menu_item_has_badge } from '@/lib/menu-badge';
import { fly_to_cart } from '@/lib/fly-to-cart';
import promo_inline from '@/components/promo-inline';
import { get_category_heading_style, subscribe_menu_store } from '@/lib/menu-store';
import { category_heading_class_name } from '@/lib/heading-style';

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
  const available = item.is_available;
  const image_ref = useRef<HTMLDivElement>(null);

  function quick_add() {
    if (!on_quick_add) return;
    fly_to_cart(image_ref.current);
    on_quick_add(item);
  }

  return (
    <div className="group flex h-full w-full flex-col items-center text-center">
      <button
        type="button"
        onClick={() => on_item_click(item)}
        className="flex w-full flex-col items-center text-center min-[1024px]:min-h-0 min-[1024px]:flex-1"
      >
        {/* wrapper без overflow — плашка может выходить за край карточки */}
        <div className="relative w-full mb-2">
          <div
            ref={image_ref}
            className={`relative aspect-square w-full overflow-hidden rounded-card ${
              available ? '' : 'opacity-45 saturate-[0.6]'
            }`}
          >
            {createElement(menu_image, {
              item,
              className: 'w-full h-full',
              variant: 'card',
            })}
          </div>
          {!available && (
            <span className="pointer-events-none absolute inset-x-0 bottom-2 z-30 mx-auto w-max rounded-pill bg-neutral-900/80 px-2.5 py-1 text-[11px] font-bold text-white">
              нет в наличии
            </span>
          )}
          {menu_item_has_badge(item) &&
            createElement(menu_badge_on_card, {
              text: item.badge_text!,
            })}
        </div>
        <p
          className={`font-bold text-[15px] leading-snug w-full px-1 mb-1 line-clamp-2 min-[1024px]:mb-0 min-[1024px]:min-h-[2.75rem] transition-colors ${
            available ? 'text-neutral-900 group-hover:text-accent' : 'text-neutral-400'
          }`}
        >
          {item.name}
        </p>
      </button>
      <div className="mt-1 min-[1024px]:mt-2 flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={!available}
          onClick={() => (available ? on_item_click(item) : undefined)}
          className={`inline-flex rounded-pill px-4 py-2 text-[15px] font-extrabold tabular-nums transition-colors ${
            available
              ? 'bg-surface text-neutral-900 hover:bg-surface/80'
              : 'bg-surface/60 text-neutral-400 cursor-not-allowed'
          }`}
          aria-label={`${item.name}, ${item.price} рублей — подробнее`}
        >
          {item.price} ₽
        </button>
        {available && on_quick_add && (
          <button
            type="button"
            onClick={quick_add}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-accent hover:bg-accent/10 transition-colors"
            aria-label={`быстро добавить ${item.name} в корзину`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function empty_cell(key: string) {
  return (
    <div key={key} aria-hidden className="pointer-events-none invisible">
      <div className="aspect-square w-full mb-2" />
      <p className="min-h-[2.75rem] mb-1 min-[1024px]:mb-2" />
      <span className="inline-flex px-4 py-2 text-[15px] font-extrabold">0 ₽</span>
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
  const [, set_tick] = useState(0);
  useEffect(() => subscribe_menu_store(() => set_tick((t) => t + 1)), []);

  const visible_categories = active_category
    ? [active_category]
    : categories.filter((cat) => items.some((i) => i.category === cat));

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
        const cat_items = items
          .filter((i) => i.category === category)
          .sort((a, b) => Number(b.is_available) - Number(a.is_available));
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
        const heading_style = get_category_heading_style(category);

        return (
          <div key={category}>
            <section
              id={`cat-${encodeURIComponent(category)}`}
              className="scroll-mt-36 sm:scroll-mt-40"
            >
              {!active_category && (
                <h2 className={category_heading_class_name(heading_style)}>{category}</h2>
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
