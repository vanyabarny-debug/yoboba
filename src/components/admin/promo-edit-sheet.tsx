'use client';

import { createElement, useEffect, useMemo, useState } from 'react';
import type { promo_banner } from '@/lib/types';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { image_upload_button } from '@/components/admin/image-file-picker';
import { classify_promo_link, allowed_platform_labels } from '@/lib/promo-link';

type props = {
  promo: promo_banner | null;
  categories: string[];
  on_close: () => void;
  on_save: (promo: promo_banner) => void;
  on_delete?: (id: string) => void;
};

type target_kind = 'section' | 'link';

function initial_kind(promo: promo_banner | null): target_kind {
  if (promo?.link_url && promo.link_url !== '/') return 'link';
  return 'section';
}

export default function promo_edit_sheet({ promo, categories, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<promo_banner | null>(promo);
  const [kind, set_kind] = useState<target_kind>(initial_kind(promo));

  useEffect(() => {
    set_draft(promo);
    set_kind(initial_kind(promo));
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

          on_save(payload);
          on_close();
        }}
        className="space-y-3"
      >
        {draft.image_url ? (
          <img src={draft.image_url} alt="" className="w-full h-40 rounded-xl object-cover bg-surface" />
        ) : (
          <div className="w-full h-40 rounded-xl bg-surface flex items-center justify-center text-sm text-neutral-400">
            фото не выбрано
          </div>
        )}
        {createElement(image_upload_button, {
          on_pick: (url) => set_draft({ ...draft, image_url: url }),
          label: draft.image_url ? 'заменить фото' : 'выбрать фото',
          className: 'w-full',
        })}
        <input
          value={draft.title}
          onChange={(e) => set_draft({ ...draft, title: e.target.value })}
          placeholder="заголовок"
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm"
          required
        />
        <input
          value={draft.subtitle || ''}
          onChange={(e) => set_draft({ ...draft, subtitle: e.target.value })}
          placeholder="подзаголовок"
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
              onClick={() => set_kind('section')}
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
                onChange={(e) => set_draft({ ...draft, link_url: e.target.value })}
                placeholder="https://t.me/yomoyo"
                className={`w-full rounded-xl border px-3 py-2 text-sm ${
                  link_invalid ? 'border-accent' : 'border-surface'
                }`}
              />
              {link_invalid ? (
                <p className="text-xs text-accent">{link_check.ok ? '' : link_check.reason}</p>
              ) : (
                <p className="text-xs text-neutral-400">
                  внутренние ссылки (/rabota) или: {allowed_platform_labels.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

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
