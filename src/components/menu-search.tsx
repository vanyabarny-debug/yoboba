'use client';

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { menu_item } from '@/lib/types';
import { highlight_query, search_menu_items } from '@/lib/menu-search';
import menu_image from '@/components/menu-image';
import { subscribe_site_content_store } from '@/lib/site-content-store';

type search_ctx = {
  open: boolean;
  query: string;
  set_query: (value: string) => void;
  open_search: () => void;
  close: () => void;
  pick: (item: menu_item) => void;
  results: ReturnType<typeof search_menu_items>;
};

const SearchContext = createContext<search_ctx | null>(null);

function use_search_ctx() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('menu_search components must be inside MenuSearchRoot');
  return ctx;
}

type root_props = {
  items: menu_item[];
  on_item_click: (item: menu_item) => void;
  on_open_change?: (open: boolean) => void;
  children: ReactNode;
};

function SearchIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function highlighted_text(text: string, query: string) {
  return highlight_query(text, query).map((part, i) =>
    part.match ? (
      <mark
        key={i}
        className="bg-neutral-200 text-neutral-900 font-semibold rounded px-0.5 not-italic"
      >
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

export function menu_search_root({ items, on_item_click, on_open_change, children }: root_props) {
  const [open, set_open] = useState(false);
  const [query, set_query] = useState('');
  const [meta_tick, set_meta_tick] = useState(0);
  const opened_at = useRef(0);
  const root_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribe_site_content_store(() => set_meta_tick((t) => t + 1));
  }, []);

  useEffect(() => {
    on_open_change?.(open);
  }, [open, on_open_change]);

  useEffect(() => {
    if (!open) return;

    function on_key(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }

    function on_pointer(e: PointerEvent) {
      if (Date.now() - opened_at.current < 120) return;
      const target = e.target as Node;
      if (root_ref.current?.contains(target)) return;
      close();
    }

    window.addEventListener('keydown', on_key);
    document.addEventListener('pointerdown', on_pointer);
    return () => {
      window.removeEventListener('keydown', on_key);
      document.removeEventListener('pointerdown', on_pointer);
    };
  }, [open]);

  const results = open && query.trim() ? search_menu_items(items, query) : [];
  void meta_tick;

  function open_search() {
    opened_at.current = Date.now();
    set_open(true);
  }

  function close() {
    set_open(false);
    set_query('');
  }

  function pick(item: menu_item) {
    on_item_click(item);
    close();
  }

  return (
    <SearchContext.Provider
      value={{ open, query, set_query, open_search, close, pick, results }}
    >
      <div ref={root_ref}>{children}</div>
    </SearchContext.Provider>
  );
}

export function menu_search_field() {
  const { open, query, set_query, open_search, close } = use_search_ctx();
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => input_ref.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  return (
    <div
      className={`relative flex h-10 shrink-0 items-center overflow-hidden rounded-pill transition-[width,background-color] duration-200 ease-out ${
        open
          ? 'w-[min(52vw,11.5rem)] sm:w-52 bg-neutral-300'
          : 'w-10 cursor-pointer text-neutral-800 hover:text-neutral-950'
      }`}
      onClick={!open ? open_search : undefined}
      onKeyDown={
        !open
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') open_search();
            }
          : undefined
      }
      role={!open ? 'button' : undefined}
      tabIndex={!open ? 0 : undefined}
      aria-label={!open ? 'поиск по меню' : undefined}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-neutral-800">
        <SearchIcon />
      </span>

      <div
        className={`flex min-w-0 flex-1 items-center gap-1 pr-1.5 transition-opacity duration-150 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <input
          ref={input_ref}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => set_query(e.target.value)}
          placeholder="блюдо, состав..."
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
          aria-label="поиск по меню"
          tabIndex={open ? 0 : -1}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          aria-label="закрыть поиск"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-400/40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function menu_search_results() {
  const { open, query, results, pick } = use_search_ctx();

  if (!open || !query.trim()) return null;

  return (
    <div className="page-shell border-t border-surface/80 bg-white pb-3 pt-2">
      {results.length === 0 ? (
        <p className="py-4 text-sm text-neutral-500">ничего не нашли</p>
      ) : (
        <ul className="max-h-[min(42vh,18rem)] overflow-y-auto -mx-1 px-1">
          {results.map(({ item, snippet, snippet_label }) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => pick(item)}
                className="w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface/80 transition-colors"
              >
                <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden bg-surface">
                  {createElement(menu_image, {
                    item,
                    className: 'h-full w-full',
                    variant: 'card',
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-neutral-900 leading-snug line-clamp-2">
                    {highlighted_text(item.name, query)}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500 leading-snug line-clamp-2">
                    <span className="text-neutral-400">{snippet_label}: </span>
                    {highlighted_text(snippet, query)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-800">{item.price} ₽</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** @deprecated use menu_search_root + menu_search_field + menu_search_results */
export default function menu_search(props: root_props) {
  return createElement(
    menu_search_root,
    props,
    createElement(menu_search_field),
    createElement(menu_search_results)
  );
}
