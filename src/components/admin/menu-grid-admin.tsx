'use client';

import { createElement, useState } from 'react';
import type { menu_item } from '@/lib/types';
import menu_image from '@/components/menu-image';
import { menu_badge_on_card } from '@/components/menu-badge';
import { menu_item_has_badge } from '@/lib/menu-badge';
import edit_pencil from '@/components/admin/edit-pencil';
import product_photo_picker from '@/components/admin/product-photo-picker';
import { desktop_category_heading_offset } from '@/components/menu-grid';

type props = {
  items: menu_item[];
  categories: string[];
  active_category?: string;
  on_item_click: (item: menu_item) => void;
  on_update_item: (item: menu_item) => void;
  on_add_item: (category: string) => void;
  on_delete_item: (id: string) => void;
};

const cols = 4;

function pad_row(list: menu_item[]): (menu_item | null)[] {
  const out: (menu_item | null)[] = [...list];
  const rem = out.length % cols;
  if (rem > 0) {
    for (let i = 0; i < cols - rem; i++) out.push(null);
  }
  return out;
}

function admin_dish_card({
  item,
  on_item_click,
  on_update_item,
  on_delete_item,
}: {
  item: menu_item;
  on_item_click: (item: menu_item) => void;
  on_update_item: (item: menu_item) => void;
  on_delete_item: (id: string) => void;
}) {
  const [editing_name, set_editing_name] = useState(false);
  const [editing_price, set_editing_price] = useState(false);
  const [name_draft, set_name_draft] = useState(item.name);
  const [price_draft, set_price_draft] = useState(String(item.price));

  function commit_name() {
    const trimmed = name_draft.trim();
    if (trimmed && trimmed !== item.name) {
      on_update_item({ ...item, name: trimmed });
    } else {
      set_name_draft(item.name);
    }
    set_editing_name(false);
  }

  function commit_price() {
    const next = Math.max(0, Math.round(Number(price_draft) || 0));
    if (next !== item.price) {
      on_update_item({ ...item, price: next });
    }
    set_price_draft(String(item.price));
    set_editing_price(false);
  }

  return (
    <div
      className={`group relative flex h-full w-full flex-col items-center text-center ${
        !item.is_available ? 'opacity-50' : ''
      }`}
    >
      <div className="flex h-full w-full flex-col items-center text-center">
        <div className="relative w-full mb-2">
          <button
            type="button"
            aria-label={`открыть «${item.name}»`}
            onClick={() => on_item_click(item)}
            className="absolute inset-0 z-0 rounded-card"
          />
          <div className="relative aspect-square w-full overflow-hidden rounded-card">
            <div className="pointer-events-none h-full w-full">
              {createElement(menu_image, {
                item,
                className: 'w-full h-full',
                variant: 'card',
              })}
            </div>
            {menu_item_has_badge(item) &&
              createElement(menu_badge_on_card, {
                text: item.badge_text!,
                size: 'sm',
              })}
          </div>
          <div className="absolute bottom-2 right-2 z-10">
            <button
              type="button"
              aria-label={`удалить «${item.name}»`}
              onClick={() => {
                if (confirm(`удалить «${item.name}»?`)) on_delete_item(item.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-neutral-500 shadow-[0_2px_8px_rgba(0,0,0,0.12)] hover:text-accent transition-colors text-sm leading-none"
            >
              ×
            </button>
          </div>
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {createElement(product_photo_picker, {
              label: 'загрузить фото',
              on_save: (url) => on_update_item({ ...item, image_url: url }),
              size: 'sm',
            })}
          </div>
          {!item.is_available && (
            <span className="absolute bottom-2 left-2 z-10 rounded-pill bg-neutral-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              стоп
            </span>
          )}
        </div>

        <div className="relative w-full px-1 mb-2 min-h-[2.75rem] max-h-[2.75rem]">
          {editing_name ? (
            <input
              autoFocus
              value={name_draft}
              onChange={(e) => set_name_draft(e.target.value)}
              onBlur={commit_name}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit_name();
                if (e.key === 'Escape') {
                  set_name_draft(item.name);
                  set_editing_name(false);
                }
              }}
              className="w-full rounded-lg border border-accent/40 px-2 py-1 text-[15px] font-bold text-center"
            />
          ) : (
            <button
              type="button"
              onClick={() => on_item_click(item)}
              className="font-bold text-[15px] leading-snug text-neutral-900 line-clamp-2 w-full"
            >
              {item.name}
            </button>
          )}
          <div className="absolute -right-1 top-0">
            {createElement(edit_pencil, {
              label: 'править название',
              onClick: () => {
                set_name_draft(item.name);
                set_editing_name(true);
              },
              className: 'h-6 w-6',
            })}
          </div>
        </div>

        <div className="relative mt-auto">
          {editing_price ? (
            <input
              autoFocus
              type="number"
              min={0}
              value={price_draft}
              onChange={(e) => set_price_draft(e.target.value)}
              onBlur={commit_price}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit_price();
                if (e.key === 'Escape') {
                  set_price_draft(String(item.price));
                  set_editing_price(false);
                }
              }}
              className="w-24 rounded-pill border border-accent/40 bg-surface px-3 py-2 text-sm font-medium text-center"
            />
          ) : (
            <span className="inline-flex rounded-pill bg-surface px-4 py-2 text-sm font-medium text-neutral-900">
              {item.price} ₽
            </span>
          )}
          <div className="absolute -right-8 top-1/2 -translate-y-1/2">
            {createElement(edit_pencil, {
              label: 'править цену',
              onClick: () => {
                set_price_draft(String(item.price));
                set_editing_price(true);
              },
              className: 'h-6 w-6',
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => on_update_item({ ...item, is_available: !item.is_available })}
        className={`mt-2 text-[11px] px-2 py-0.5 rounded-pill ${
          item.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        {item.is_available ? 'в меню' : 'в стоп'}
      </button>
    </div>
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

export { desktop_category_heading_offset };

export default function menu_grid_admin({
  items,
  categories,
  active_category,
  on_item_click,
  on_update_item,
  on_add_item,
  on_delete_item,
}: props) {
  const visible_categories = active_category
    ? [active_category]
    : categories.filter((cat) => items.some((i) => i.category === cat));

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
        const cat_items = items.filter((i) => i.category === category);
        const desktop_cells = pad_row(cat_items);

        return (
          <section
            key={category}
            id={`cat-${encodeURIComponent(category)}`}
            className="scroll-mt-36 sm:scroll-mt-40"
          >
            {!active_category && (
              <div className="flex items-center justify-between mb-4 sm:mb-5">
                <h2 className="font-display text-xl sm:text-2xl font-bold capitalize">
                  {category}
                </h2>
                <button
                  type="button"
                  onClick={() => on_add_item(category)}
                  className="text-xs rounded-pill bg-accent text-accent-foreground px-3 py-1.5"
                >
                  + блюдо
                </button>
              </div>
            )}

            {active_category && (
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={() => on_add_item(category)}
                  className="text-xs rounded-pill bg-accent text-accent-foreground px-3 py-1.5"
                >
                  + блюдо
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 min-[1024px]:grid-cols-4 gap-2 gap-y-5">
              {cat_items.map((item) => (
                <div key={item.id} className="min-w-0">
                  {createElement(admin_dish_card, {
                    item,
                    on_item_click,
                    on_update_item,
                    on_delete_item,
                  })}
                </div>
              ))}
              {desktop_cells.slice(cat_items.length).map((_, idx) => (
                <div key={`empty-${category}-${idx}`} className="hidden min-[1024px]:block">
                  {empty_cell(`empty-${category}-${idx}`)}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
