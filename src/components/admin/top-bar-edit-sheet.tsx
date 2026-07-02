'use client';

import { createElement, useEffect, useState } from 'react';
import {
  get_page_by_slug,
  type site_page,
  type top_bar_link,
} from '@/lib/site-content-store';
import { admin_sheet } from '@/components/admin/admin-sheet';

type props = {
  link: top_bar_link | null;
  on_close: () => void;
  on_save: (link: top_bar_link, page?: site_page) => void;
  on_delete?: (id: string) => void;
};

function slug_from_href(href: string) {
  return href.replace(/^\//, '').split('?')[0] || '';
}

export default function top_bar_edit_sheet({ link, on_close, on_save, on_delete }: props) {
  const [draft_link, set_draft_link] = useState<top_bar_link | null>(link);
  const [draft_page, set_draft_page] = useState<site_page | null>(null);

  useEffect(() => {
    set_draft_link(link);
    if (!link) {
      set_draft_page(null);
      return;
    }
    const slug = slug_from_href(link.href);
    set_draft_page(slug ? get_page_by_slug(slug) ?? null : null);
  }, [link]);

  if (!draft_link) return null;

  return createElement(admin_sheet, {
    open: true,
    title: 'раздел верхней плашки',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          on_save(
            {
              ...draft_link,
              label: draft_link.label.trim(),
              href: draft_link.href.trim(),
            },
            draft_page ?? undefined
          );
          on_close();
        }}
        className="space-y-3"
      >
        <input
          value={draft_link.label}
          onChange={(e) => set_draft_link({ ...draft_link, label: e.target.value })}
          placeholder="название в плашке"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
          required
        />
        <input
          value={draft_link.href}
          onChange={(e) => {
            const href = e.target.value;
            set_draft_link({ ...draft_link, href });
            const slug = slug_from_href(href);
            set_draft_page(slug ? get_page_by_slug(slug) ?? null : null);
          }}
          placeholder="/o-nas"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
          required
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft_link.is_active}
            onChange={(e) => set_draft_link({ ...draft_link, is_active: e.target.checked })}
          />
          показывать на сайте
        </label>

        {draft_page && (
          <div className="rounded-xl border border-surface bg-surface/40 p-3 space-y-2">
            <p className="text-xs font-medium text-neutral-500">текст страницы</p>
            <input
              value={draft_page.title}
              onChange={(e) => set_draft_page({ ...draft_page, title: e.target.value })}
              placeholder="заголовок страницы"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
            />
            <textarea
              value={draft_page.body}
              onChange={(e) => set_draft_page({ ...draft_page, body: e.target.value })}
              rows={6}
              placeholder="текст страницы"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white resize-y"
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {draft_link.id && on_delete && (
            <button
              type="button"
              onClick={() => {
                if (confirm('удалить раздел?')) {
                  on_delete(draft_link.id);
                  on_close();
                }
              }}
              className="rounded-pill border border-surface px-4 py-2.5 text-sm text-accent"
            >
              удалить
            </button>
          )}
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
