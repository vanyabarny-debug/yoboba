'use client';

import { createElement, useEffect, useState } from 'react';
import type { sidebar_ad_slide } from '@/lib/types';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { image_upload_button } from '@/components/admin/image-file-picker';

type props = {
  slide: sidebar_ad_slide | null;
  categories: string[];
  on_close: () => void;
  on_save: (slide: sidebar_ad_slide) => void;
  on_delete?: (id: string) => void;
};

export default function sidebar_edit_sheet({ slide, categories, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<sidebar_ad_slide | null>(slide);

  useEffect(() => {
    set_draft(slide);
  }, [slide]);

  if (!draft) return null;

  return createElement(admin_sheet, {
    open: true,
    title: draft.id ? 'редактировать баннер' : 'новый баннер',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.title.trim() || !draft.image_url) return;
          on_save({
            ...draft,
            title: draft.title.trim(),
            subtitle: draft.subtitle?.trim() || undefined,
            category: draft.category?.trim() || null,
            menu_id: draft.menu_id?.trim() || null,
          });
          on_close();
        }}
        className="space-y-3"
      >
        {draft.image_url ? (
          <img src={draft.image_url} alt="" className="w-full h-52 rounded-xl object-cover bg-surface" />
        ) : (
          <div className="w-full h-52 rounded-xl bg-surface flex items-center justify-center text-sm text-neutral-400">
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
        <select
          value={draft.category || ''}
          onChange={(e) => set_draft({ ...draft, category: e.target.value || null })}
          className="w-full rounded-xl border border-surface px-3 py-2 text-sm capitalize"
        >
          <option value="">без категории</option>
          {categories.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </select>
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
                if (confirm('удалить баннер?')) {
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
            className="flex-1 rounded-pill bg-accent text-accent-foreground py-2.5 text-sm font-medium"
          >
            сохранить
          </button>
        </div>
      </form>
    ),
  });
}
