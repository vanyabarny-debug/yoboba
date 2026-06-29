'use client';

import Link from 'next/link';
import { createElement, useEffect, useState } from 'react';
import edit_pencil from '@/components/admin/edit-pencil';
import {
  get_site_content_store,
  subscribe_site_content_store,
  type top_bar_link,
} from '@/lib/site-content-store';

type props = {
  edit_mode?: boolean;
  on_edit_link?: (link: top_bar_link) => void;
  on_add_link?: () => void;
  on_edit_lang?: () => void;
};

export default function top_bar({
  edit_mode = false,
  on_edit_link,
  on_add_link,
  on_edit_lang,
}: props) {
  const [links, set_links] = useState<top_bar_link[]>(
    () => get_site_content_store().top_bar_links.filter((l) => l.is_active)
  );
  const [all_links, set_all_links] = useState<top_bar_link[]>(
    () => get_site_content_store().top_bar_links
  );
  const [lang, set_lang] = useState(() => get_site_content_store().lang_link);

  useEffect(() => {
    function reload() {
      const store = get_site_content_store();
      set_all_links(store.top_bar_links);
      set_links(store.top_bar_links.filter((l) => l.is_active));
      set_lang(store.lang_link);
    }
    reload();
    return subscribe_site_content_store(reload);
  }, []);

  const visible = edit_mode ? all_links : links;

  return (
    <div className="page-shell py-2 flex items-center justify-between gap-4 text-xs text-neutral-500">
      <nav className="flex items-center gap-2 overflow-x-auto stories-scroll min-w-0">
        {visible.map((link) => (
          <span key={link.id} className="relative flex-shrink-0 group flex items-center gap-1">
            {edit_mode ? (
              <button
                type="button"
                onClick={() => on_edit_link?.(link)}
                className={`whitespace-nowrap px-1 hover:text-neutral-800 transition-colors ${
                  link.is_active ? '' : 'opacity-40 line-through'
                }`}
              >
                {link.label}
              </button>
            ) : (
              <Link
                href={link.href}
                className="flex-shrink-0 whitespace-nowrap hover:text-neutral-800 transition-colors"
              >
                {link.label}
              </Link>
            )}
            {edit_mode &&
              createElement(edit_pencil, {
                label: `править «${link.label}»`,
                onClick: () => on_edit_link?.(link),
                className: 'h-5 w-5',
              })}
          </span>
        ))}
        {edit_mode && on_add_link && (
          <button
            type="button"
            onClick={on_add_link}
            className="flex-shrink-0 rounded-pill bg-accent/10 text-accent px-2 py-1 text-xs font-medium"
          >
            + раздел
          </button>
        )}
      </nav>
      <span className="relative flex-shrink-0 flex items-center gap-1">
        {edit_mode ? (
          <button
            type="button"
            onClick={() => on_edit_lang?.()}
            className="flex items-center gap-1.5 hover:text-neutral-800 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            {lang.label}
          </button>
        ) : (
          <Link
            href={lang.href}
            className="flex items-center gap-1.5 hover:text-neutral-800 transition-colors"
            aria-label={lang.label}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3c-2.5 2.8-4 6-4 9s1.5 6.2 4 9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            {lang.label}
          </Link>
        )}
        {edit_mode &&
          on_edit_lang &&
          createElement(edit_pencil, {
            label: 'править кнопку язык',
            onClick: on_edit_lang,
            className: 'h-5 w-5',
          })}
      </span>
    </div>
  );
}
