'use client';

import { useCallback, useLayoutEffect, useRef, useState, createElement } from 'react';
import edit_pencil from '@/components/admin/edit-pencil';
import {
  menu_search_field,
  menu_search_results,
  menu_search_root,
} from '@/components/menu-search';
import cart_mark from '@/components/cart-mark';
import type { menu_item } from '@/lib/types';

type props = {
  categories: string[];
  active: string | null;
  cart_count: number;
  cart_total: number;
  items?: menu_item[];
  on_change: (category: string | null) => void;
  on_cart_click: () => void;
  on_item_click?: (item: menu_item) => void;
  edit_mode?: boolean;
  on_edit_category?: (category: string) => void;
  on_add_category?: () => void;
};

const EDGE_PAD = 56;

export default function category_nav({
  categories,
  active,
  cart_count,
  cart_total,
  items = [],
  on_change,
  on_cart_click,
  on_item_click,
  edit_mode = false,
  on_edit_category,
  on_add_category,
}: props) {
  const scroll_ref = useRef<HTMLDivElement>(null);
  const track_ref = useRef<HTMLDivElement>(null);
  const wrap_ref = useRef<HTMLDivElement>(null);
  const [can_left, set_can_left] = useState(false);
  const [can_right, set_can_right] = useState(() => categories.length + 1 > 6);
  const [search_open, set_search_open] = useState(false);

  const update_arrows = useCallback(() => {
    const el = scroll_ref.current;
    const track = track_ref.current;
    if (!el) return;

    const overflow_by_scroll = el.scrollWidth - el.clientWidth > 4;
    const overflow_by_layout =
      track !== null &&
      track.getBoundingClientRect().right > el.getBoundingClientRect().right + 1;

    const has_overflow = overflow_by_scroll || overflow_by_layout;

    set_can_left(el.scrollLeft > 4);
    set_can_right(
      has_overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    );
  }, []);

  useLayoutEffect(() => {
    update_arrows();
    const el = scroll_ref.current;
    const track = track_ref.current;
    const wrap = wrap_ref.current;
    if (!el) return;

    el.addEventListener('scroll', update_arrows, { passive: true });
    window.addEventListener('resize', update_arrows);

    const ro = new ResizeObserver(update_arrows);
    ro.observe(el);
    if (track) ro.observe(track);
    if (wrap) ro.observe(wrap);

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update_arrows);
    };

    schedule();
    const raf2 = requestAnimationFrame(schedule);

    document.fonts?.ready.then(update_arrows);
    document.fonts?.addEventListener?.('loadingdone', update_arrows);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
      el.removeEventListener('scroll', update_arrows);
      window.removeEventListener('resize', update_arrows);
      document.fonts?.removeEventListener?.('loadingdone', update_arrows);
      ro.disconnect();
    };
  }, [categories, cart_count, cart_total, update_arrows]);

  function pick(cat: string | null) {
    on_change(cat);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function scroll_tab_to_start(
    container: HTMLDivElement,
    tab: HTMLElement,
    pad_left: number
  ) {
    const cr = container.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const target = container.scrollLeft + (tr.left - cr.left) - pad_left;
    const final_target = Math.max(0, target);
    container.scrollTo({ left: final_target, behavior: 'smooth' });
  }

  function scroll_tabs(dir: -1 | 1) {
    const el = scroll_ref.current;
    if (!el) return;

    const tabs = track_ref.current
      ? ([...track_ref.current.children] as HTMLElement[])
      : [];
    if (tabs.length === 0) return;

    const cr = el.getBoundingClientRect();
    const pad_left = can_left ? EDGE_PAD : 8;
    const pad_right = can_right ? EDGE_PAD : 8;
    const zone_left = cr.left + pad_left;
    const zone_right = cr.right - pad_right;

    if (dir === 1) {
      let last_full = -1;
      for (let i = 0; i < tabs.length; i++) {
        const tr = tabs[i].getBoundingClientRect();
        if (tr.left >= zone_left - 1 && tr.right <= zone_right + 1) {
          last_full = i;
        }
      }

      const next_idx = last_full + 1;
      const max_scroll = el.scrollWidth - el.clientWidth;

      if (next_idx >= tabs.length) return;

      const next = tabs[next_idx];
      const next_tr = next.getBoundingClientRect();
      const ideal = el.scrollLeft + (next_tr.left - cr.left) - pad_left;
      const reveal = Math.max(next_tr.right - zone_right, 0);

      if (ideal <= max_scroll) {
        el.scrollTo({ left: ideal, behavior: 'smooth' });
        return;
      }

      const step = Math.min(reveal, max_scroll - el.scrollLeft);

      if (step > 1) {
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
      return;
    }

    let first_visible = -1;
    for (let i = 0; i < tabs.length; i++) {
      const tr = tabs[i].getBoundingClientRect();
      if (tr.right > zone_left + 1 && tr.left < zone_right - 1) {
        first_visible = i;
        break;
      }
    }

    if (first_visible <= 0) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    scroll_tab_to_start(el, tabs[first_visible - 1], pad_left);
  }

  useLayoutEffect(() => {
    const el = scroll_ref.current;
    const track = track_ref.current;
    if (!el || !track) return;

    const idx = active === null ? 0 : categories.indexOf(active) + 1;
    if (idx < 0) return;

    const tab = track.children[idx] as HTMLElement | undefined;
    if (!tab) return;

    const cr = el.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const visible =
      tr.left >= cr.left + EDGE_PAD - 1 && tr.right <= cr.right - EDGE_PAD + 1;

    if (!visible) {
      const pad = active === null ? 0 : EDGE_PAD;
      const target = el.scrollLeft + (tr.left - cr.left) - pad;
      const max = el.scrollWidth - el.clientWidth;
      el.scrollTo({
        left: Math.max(0, Math.min(target, max)),
        behavior: 'smooth',
      });
    }
  }, [active, categories]);

  const show_search = !edit_mode && Boolean(on_item_click) && items.length > 0;

  const nav_body = (
    <>
      <div className="page-shell flex items-center gap-1.5 sm:gap-2 pt-5 pb-3 sm:pt-6 sm:pb-4">
        <div
          ref={wrap_ref}
          className={`relative flex-1 min-w-0 transition-opacity duration-200 ${
            search_open ? 'opacity-35 pointer-events-none' : ''
          }`}
        >
          {can_left && (
            <div className="absolute left-0 inset-y-0 z-10 flex items-stretch pointer-events-none">
              <button
                type="button"
                onClick={() => scroll_tabs(-1)}
                aria-label="прокрутить категории влево"
                className="pointer-events-auto flex w-9 sm:w-10 shrink-0 items-center justify-center bg-white text-neutral-800 hover:text-neutral-950 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
              <div
                className="w-5 sm:w-6 bg-gradient-to-r from-white to-transparent self-stretch"
                aria-hidden="true"
              />
            </div>
          )}

          <div
            ref={scroll_ref}
            className="overflow-x-auto stories-scroll min-w-0"
            style={{
              scrollPaddingLeft: can_left ? EDGE_PAD : undefined,
              scrollPaddingRight: can_right ? EDGE_PAD : undefined,
            }}
          >
            <div ref={track_ref} className="flex w-max shrink-0 gap-0.5">
            <button
              type="button"
              onClick={() => pick(null)}
              className={`flex-shrink-0 pl-0 pr-2.5 sm:pr-3 py-2 text-sm whitespace-nowrap transition-colors ${
                active === null
                  ? 'font-bold text-accent-pink min-[1024px]:text-accent'
                  : 'text-neutral-900 hover:text-accent-pink min-[1024px]:hover:text-accent'
              }`}
            >
              все
            </button>
            {categories.map((cat) => (
              <span key={cat} className="relative flex-shrink-0 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => pick(cat)}
                  className={`px-2.5 sm:px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                    active === cat
                      ? 'font-bold text-accent-pink min-[1024px]:text-accent'
                      : 'text-neutral-900 hover:text-accent-pink min-[1024px]:hover:text-accent'
                  }`}
                >
                  {cat}
                </button>
                {edit_mode &&
                  on_edit_category &&
                  createElement(edit_pencil, {
                    label: `править «${cat}»`,
                    onClick: () => on_edit_category(cat),
                    className: 'h-5 w-5 -ml-1',
                  })}
              </span>
            ))}
            {edit_mode && on_add_category && (
              <button
                type="button"
                onClick={on_add_category}
                className="flex-shrink-0 px-2 py-2 text-sm text-accent font-medium"
              >
                + категория
              </button>
            )}
            </div>
          </div>

          {can_right && (
            <div className="absolute right-0 inset-y-0 z-10 flex items-stretch pointer-events-none">
              <div
                className="w-5 sm:w-6 bg-gradient-to-l from-white to-transparent self-stretch"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => scroll_tabs(1)}
                aria-label="прокрутить категории вправо"
                className="pointer-events-auto flex w-9 sm:w-10 shrink-0 items-center justify-center bg-white text-neutral-800 hover:text-neutral-950 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {!edit_mode && on_item_click && items.length > 0 && (
          <div className="mr-2.5 sm:mr-4 shrink-0">
            {createElement(menu_search_field)}
          </div>
        )}

        {!edit_mode && (
        <button
          type="button"
          onClick={on_cart_click}
          data-cart-target
          className="hidden min-[1024px]:flex flex-shrink-0 items-center justify-center gap-2 rounded-pill bg-accent text-accent-foreground pl-3.5 pr-4 sm:px-5 py-2.5 shadow-[0_6px_18px_rgba(255,107,107,0.35)] hover:shadow-[0_8px_22px_rgba(255,107,107,0.45)] hover:-translate-y-px transition-all"
        >
          {createElement(cart_mark, { size: 22 })}
          <span className="text-[17px] sm:text-lg font-extrabold leading-none">
            {cart_count > 0 ? `${cart_total} ₽` : 'корзина'}
          </span>
        </button>
        )}
        {edit_mode && (
          <span className="flex-shrink-0 rounded-pill bg-surface px-3 py-2 text-xs text-neutral-500">
            режим правки
          </span>
        )}
      </div>
      {show_search && createElement(menu_search_results)}
    </>
  );

  return (
    <nav>
      {show_search
        ? createElement(menu_search_root, {
            items,
            on_item_click: on_item_click!,
            on_open_change: set_search_open,
            children: nav_body,
          })
        : nav_body}
    </nav>
  );
}
