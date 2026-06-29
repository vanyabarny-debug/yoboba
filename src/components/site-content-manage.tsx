'use client';

import { useEffect, useState } from 'react';
import { get_menu_store } from '@/lib/menu-store';
import {
  delete_top_bar_link,
  get_site_content_store,
  move_top_bar_link,
  new_top_bar_link_id,
  reset_site_content_store,
  save_site_content_store,
  set_lang_link,
  upsert_page,
  upsert_top_bar_link,
  type site_page,
  type top_bar_link,
} from '@/lib/site-content-store';

const empty_link: top_bar_link = {
  id: '',
  label: '',
  href: '/',
  is_active: true,
};

export default function site_content_manage() {
  const [links, set_links] = useState<top_bar_link[]>([]);
  const [lang, set_lang] = useState({ label: 'язык', href: '/yazyk' });
  const [pages, set_pages] = useState<site_page[]>([]);
  const [categories, set_categories] = useState<string[]>([]);
  const [compositions, set_compositions] = useState<Record<string, string>>({});
  const [descriptions, set_descriptions] = useState<Record<string, string>>({});
  const [editing_link, set_editing_link] = useState<top_bar_link | null>(null);
  const [editing_page_slug, set_editing_page_slug] = useState<string>('');
  const [editing_page, set_editing_page] = useState<site_page | null>(null);

  function reload() {
    const store = get_site_content_store();
    set_links(store.top_bar_links);
    set_lang(store.lang_link);
    set_pages(store.pages);
    set_compositions(store.category_compositions);
    set_descriptions(store.category_descriptions);
    set_categories(get_menu_store().categories);
  }

  useEffect(() => {
    reload();
  }, []);

  function save_lang() {
    set_lang_link(lang);
    reload();
  }

  function save_page(e: React.FormEvent) {
    e.preventDefault();
    if (!editing_page) return;
    upsert_page({
      ...editing_page,
      slug: editing_page.slug.trim(),
      title: editing_page.title.trim(),
      body: editing_page.body.trim(),
    });
    set_editing_page(null);
    reload();
  }

  function save_link(e: React.FormEvent) {
    e.preventDefault();
    if (!editing_link) return;
    upsert_top_bar_link({
      ...editing_link,
      id: editing_link.id || new_top_bar_link_id(),
      label: editing_link.label.trim(),
      href: editing_link.href.trim(),
    });
    set_editing_link(null);
    reload();
  }

  function save_product_meta() {
    const store = get_site_content_store();
    store.category_compositions = { ...compositions };
    store.category_descriptions = { ...descriptions };
    save_site_content_store(store);
    reload();
  }

  return (
    <section className="bg-white rounded-card border border-surface p-4 shadow-soft space-y-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">контент сайта</h2>
          <p className="text-xs text-neutral-500">верхняя плашка, страницы, состав</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('сбросить контент к дефолту?')) {
              reset_site_content_store();
              reload();
            }
          }}
          className="text-xs text-neutral-400"
        >
          сброс
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">кнопки верхней плашки</h3>
          <button
            type="button"
            onClick={() => set_editing_link({ ...empty_link })}
            className="text-xs rounded-pill bg-accent text-white px-3 py-1.5"
          >
            + ссылка
          </button>
        </div>
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 bg-surface rounded-xl p-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{link.label}</p>
                <p className="text-xs text-neutral-500 truncate">{link.href}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  move_top_bar_link(link.id, -1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => {
                  move_top_bar_link(link.id, 1);
                  reload();
                }}
                className="w-7 h-7 rounded-lg bg-white text-neutral-500"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  upsert_top_bar_link({ ...link, is_active: !link.is_active });
                  reload();
                }}
                className={`text-xs px-2 py-1 rounded-pill ${
                  link.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {link.is_active ? 'вкл' : 'выкл'}
              </button>
              <button
                type="button"
                onClick={() => set_editing_link({ ...link })}
                className="text-xs text-accent"
              >
                править
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`удалить «${link.label}»?`)) {
                    delete_top_bar_link(link.id);
                    reload();
                  }
                }}
                className="text-xs text-neutral-400"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={lang.label}
            onChange={(e) => set_lang({ ...lang, label: e.target.value })}
            placeholder="язык"
            className="rounded-xl border border-surface px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={lang.href}
            onChange={(e) => set_lang({ ...lang, href: e.target.value })}
            placeholder="/yazyk"
            className="rounded-xl border border-surface px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={save_lang}
          className="mt-2 text-xs text-accent"
        >
          сохранить кнопку «язык»
        </button>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">тексты страниц</h3>
        <select
          value={editing_page_slug}
          onChange={(e) => {
            const slug = e.target.value;
            set_editing_page_slug(slug);
            const page = pages.find((p) => p.slug === slug) ?? null;
            set_editing_page(page ? { ...page } : null);
          }}
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm mb-3"
        >
          <option value="">выберите страницу</option>
          {pages.map((page) => (
            <option key={page.slug} value={page.slug}>
              {page.title} ({page.slug})
            </option>
          ))}
        </select>
        {editing_page && (
          <form onSubmit={save_page} className="space-y-3 bg-surface rounded-xl p-4">
            <input
              type="text"
              value={editing_page.title}
              onChange={(e) => set_editing_page({ ...editing_page, title: e.target.value })}
              placeholder="заголовок"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
            />
            <textarea
              value={editing_page.body}
              onChange={(e) => set_editing_page({ ...editing_page, body: e.target.value })}
              placeholder="текст страницы (абзацы через пустую строку)"
              rows={8}
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm resize-y"
            />
            <p className="text-xs text-neutral-500">slug: {editing_page.slug}</p>
            <button type="submit" className="rounded-pill bg-accent text-white px-4 py-2 text-sm">
              сохранить страницу
            </button>
          </form>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">состав и описание по категориям</h3>
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat} className="bg-surface rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium capitalize">{cat}</p>
              <input
                type="text"
                value={compositions[cat] ?? ''}
                onChange={(e) =>
                  set_compositions({ ...compositions, [cat]: e.target.value })
                }
                placeholder="состав через запятую"
                className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              />
              <textarea
                value={descriptions[cat] ?? ''}
                onChange={(e) =>
                  set_descriptions({ ...descriptions, [cat]: e.target.value })
                }
                placeholder="описание для карточки"
                rows={2}
                className="w-full rounded-xl border border-surface px-3 py-2 text-sm resize-y"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={save_product_meta}
          className="mt-3 rounded-pill bg-accent text-white px-4 py-2 text-sm"
        >
          сохранить состав и описания
        </button>
      </div>

      {editing_link && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <button
            type="button"
            aria-label="закрыть"
            className="absolute inset-0 bg-black/30"
            onClick={() => set_editing_link(null)}
          />
          <form
            onSubmit={save_link}
            className="relative w-full max-w-md bg-white rounded-card p-5 shadow-soft space-y-3"
          >
            <h3 className="font-semibold">ссылка плашки</h3>
            <input
              type="text"
              value={editing_link.label}
              onChange={(e) => set_editing_link({ ...editing_link, label: e.target.value })}
              placeholder="название"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              value={editing_link.href}
              onChange={(e) => set_editing_link({ ...editing_link, href: e.target.value })}
              placeholder="/o-nas"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
              required
            />
            <button type="submit" className="w-full rounded-pill bg-accent text-white py-2.5 text-sm">
              сохранить
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
