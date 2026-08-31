'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { promo_banner } from '@/lib/types';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { image_upload_button } from '@/components/admin/image-file-picker';
import { classify_promo_link, allowed_platform_labels } from '@/lib/promo-link';
import { PROMO_SIZE_HINT } from '@/lib/promo-format';
import { get_page_by_slug, type site_page } from '@/lib/site-content-store';
import promo_title_layout_editor from '@/components/admin/promo-title-layout-editor';
import { default_promo_title_layout } from '@/lib/promo-title-layout';
import { default_promo_image_vignette } from '@/lib/promo-image-vignette';

type props = {
  promo: promo_banner | null;
  categories: string[];
  on_close: () => void;
  on_save: (promo: promo_banner, page?: site_page) => void;
  on_delete?: (id: string) => void;
};

type target_kind = 'section' | 'link';

function slug_from_href(href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return '';
  return href.replace(/^\//, '').split('?')[0] || '';
}

function initial_kind(promo: promo_banner | null): target_kind {
  if (promo?.link_url && promo.link_url !== '/') return 'link';
  return 'section';
}

export default function promo_edit_sheet({ promo, categories, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<promo_banner | null>(promo);
  const [kind, set_kind] = useState<target_kind>(initial_kind(promo));
  const [draft_page, set_draft_page] = useState<site_page | null>(null);

  useEffect(() => {
    set_draft(promo);
    set_kind(initial_kind(promo));
    const slug = promo?.link_url ? slug_from_href(promo.link_url) : '';
    set_draft_page(slug ? get_page_by_slug(slug) ?? null : null);
  }, [promo]);

  const link_check = useMemo(
    () => classify_promo_link(draft?.link_url),
    [draft?.link_url]
  );
  const link_invalid = kind === 'link' && !link_check.ok;

  if (!draft) return null;

  return createElement(admin_sheet, {
    open: true,
    title: draft.id ? 'редактировать акцию' : 'новая акция',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.title.trim() || !draft.image_url) return;

          const base = {
            ...draft,
            title: draft.title.trim(),
            subtitle: draft.subtitle?.trim() || undefined,
            badge: draft.badge?.trim() || undefined,
            cta_label: draft.cta_label?.trim() || undefined,
            title_in_image: draft.title_in_image === true,
            title_layout: draft.title_in_image ? undefined : draft.title_layout,
            image_vignette:
              draft.image_vignette && draft.image_vignette.strength > 0
                ? draft.image_vignette
                : undefined,
          };

          let payload: promo_banner;
          if (kind === 'link') {
            if (!link_check.ok) return;
            payload = {
              ...base,
              link_url: link_check.normalized || undefined,
              category: null,
              menu_id: null,
            };
          } else {
            payload = {
              ...base,
              category: draft.category?.trim() || null,
              menu_id: draft.menu_id?.trim() || null,
              link_url: undefined,
            };
          }

          const page_to_save =
            kind === 'link' && draft_page
              ? {
                  ...draft_page,
                  title: draft_page.title.trim() || payload.title,
                  body: draft_page.body,
                }
              : undefined;

          on_save(payload, page_to_save);
          on_close();
        }}
        className="space-y-3"
      >
        {draft.image_url ? (
          createElement(promo_title_layout_editor, {
            title: draft.title,
            image_url: draft.image_url,
            title_in_image: draft.title_in_image === true,
            layout: draft.title_layout || default_promo_title_layout(),
            on_change: (title_layout) => set_draft({ ...draft, title_layout }),
            vignette: draft.image_vignette ?? null,
            on_vignette_change: (image_vignette) =>
              set_draft({ ...draft, image_vignette: image_vignette ?? undefined }),
          })
        ) : (
          <div className="mx-auto w-28 aspect-[2/3] rounded-xl bg-surface flex items-center justify-center text-sm text-neutral-400">
            фото
          </div>
        )}
        {createElement(image_upload_button, {
          on_pick: (url) => set_draft({ ...draft, image_url: url }),
          label: draft.image_url ? 'заменить фото' : 'выбрать фото',
          className: 'w-full',
        })}
        <p className="text-xs text-neutral-500">
          размер картинки: <span className="font-medium text-neutral-700">{PROMO_SIZE_HINT}</span>.
          важные элементы — не ближе ~120px к верхнему и нижнему краю (там прогресс и кнопка в сторис).
        </p>
        <textarea
          value={draft.title}
          onChange={(e) => set_draft({ ...draft, title: e.target.value })}
          placeholder={'заголовок\nможно с новой строки'}
          rows={2}
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm resize-y"
          required
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!draft.title_in_image}
            onChange={(e) => {
              const overlay = e.target.checked;
              set_draft({
                ...draft,
                title_in_image: !overlay,
                title_layout:
                  overlay && !draft.title_layout
                    ? default_promo_title_layout()
                    : draft.title_layout,
              });
            }}
          />
          <span>
            белый текст на фото
            <span className="mt-0.5 block text-xs text-neutral-400">
              цвет, тень, обводка, размер и позиция на кадре
            </span>
          </span>
        </label>
        <input
          value={draft.subtitle || ''}
          onChange={(e) => set_draft({ ...draft, subtitle: e.target.value })}
          placeholder="подзаголовок"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
        />
        <input
          value={draft.badge || ''}
          onChange={(e) => set_draft({ ...draft, badge: e.target.value })}
          placeholder="бейдж (до 01.09…)"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
        />

        <div className="rounded-xl border border-surface p-3 space-y-3">
          <p className="text-xs font-medium text-neutral-500">кнопка перехода</p>

          <input
            value={draft.cta_label || ''}
            onChange={(e) => set_draft({ ...draft, cta_label: e.target.value })}
            placeholder="подпись кнопки (по умолчанию «перейти»)"
            className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                set_kind('section');
                set_draft_page(null);
              }}
              className={`flex-1 rounded-pill py-2 text-sm ${
                kind === 'section'
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-surface text-neutral-600'
              }`}
            >
              раздел
            </button>
            <button
              type="button"
              onClick={() => set_kind('link')}
              className={`flex-1 rounded-pill py-2 text-sm ${
                kind === 'link'
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-surface text-neutral-600'
              }`}
            >
              ссылка
            </button>
          </div>

          {kind === 'section' ? (
            <select
              value={draft.category || ''}
              onChange={(e) => set_draft({ ...draft, category: e.target.value || null })}
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm capitalize"
            >
              <option value="">без перехода</option>
              {categories.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-1">
              <input
                value={draft.link_url || ''}
                onChange={(e) => {
                  const link_url = e.target.value;
                  set_draft({ ...draft, link_url });
                  const slug = slug_from_href(link_url);
                  set_draft_page(slug ? get_page_by_slug(slug) ?? null : null);
                }}
                placeholder="/akciya-pervye-100"
                className={`w-full rounded-xl border px-3 py-2 text-sm ${
                  link_invalid ? 'border-accent' : 'border-surface'
                }`}
              />
              {link_invalid ? (
                <p className="text-xs text-accent">{link_check.ok ? '' : link_check.reason}</p>
              ) : (
                <p className="text-xs text-neutral-400">
                  внутренние ссылки (/akciya-pervye-100) или: {allowed_platform_labels.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        {kind === 'link' && draft_page && (
          <div className="rounded-xl border border-surface bg-surface/40 p-3 space-y-2">
            <p className="text-xs font-medium text-neutral-500">
              реклама и наполнение страницы акции
            </p>
            <input
              value={draft_page.title}
              onChange={(e) => set_draft_page({ ...draft_page, title: e.target.value })}
              placeholder="заголовок страницы"
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white"
            />
            <textarea
              value={draft_page.body}
              onChange={(e) => set_draft_page({ ...draft_page, body: e.target.value })}
              rows={16}
              placeholder={`лид-текст акции…

## условия
текст раздела

1. пункт
описание пункта`}
              className="w-full rounded-xl border border-surface px-3 py-2 text-sm bg-white resize-y font-mono leading-relaxed"
            />
            <p className="text-[11px] text-neutral-400">
              разделы через ## , пункты через 1. заголовок + текст с новой строки
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => set_draft({ ...draft, is_active: e.target.checked })}
          />
          показывать на сайте
        </label>
        <div className="flex gap-2 pt-2">
          {draft.id && on_delete && (
            <button
              type="button"
              onClick={() => {
                if (confirm('удалить акцию?')) {
                  on_delete(draft.id);
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
            disabled={link_invalid}
            className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-40"
          >
            сохранить
          </button>
        </div>
      </form>
    ),
  });
}
