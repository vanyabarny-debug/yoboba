'use client';

import { createElement, useEffect, useState } from 'react';
import type { store_spot } from '@/lib/types';
import { admin_sheet } from '@/components/admin/admin-sheet';
import { demo_cities } from '@/lib/location';

type props = {
  spot: store_spot | null;
  on_close: () => void;
  on_save: (spot: store_spot) => void;
  on_delete?: (id: string) => void;
};

export default function spot_edit_sheet({ spot, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<store_spot | null>(spot);

  useEffect(() => {
    set_draft(spot);
  }, [spot]);

  if (!draft) return null;

  return createElement(admin_sheet, {
    open: true,
    title: draft.id && draft.address ? 'редактировать точку' : 'новая точка',
    on_close,
    children: (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.city.trim() || !draft.address.trim()) return;
          on_save({
            ...draft,
            city: draft.city.trim().toLowerCase(),
            address: draft.address.trim(),
            label: draft.label?.trim() || undefined,
          });
          on_close();
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="text-sm text-neutral-600">город</span>
          <select
            value={draft.city}
            onChange={(e) => set_draft({ ...draft, city: e.target.value })}
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50 capitalize"
          >
            {demo_cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">полный адрес</span>
          <input
            value={draft.address}
            onChange={(e) => set_draft({ ...draft, address: e.target.value })}
            placeholder="Кимры, ул. Урицкого, 12"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">короткое имя (необязательно)</span>
          <input
            value={draft.label ?? ''}
            onChange={(e) => set_draft({ ...draft, label: e.target.value })}
            placeholder="центр"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => set_draft({ ...draft, is_active: e.target.checked })}
          />
          активна
        </label>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 rounded-pill bg-accent text-accent-foreground py-3 font-medium"
          >
            сохранить
          </button>
          {on_delete && draft.id && (
            <button
              type="button"
              onClick={() => {
                on_delete(draft.id);
                on_close();
              }}
              className="rounded-pill border border-surface px-4 py-3 text-sm text-neutral-600"
            >
              удалить
            </button>
          )}
        </div>
      </form>
    ),
  });
}
