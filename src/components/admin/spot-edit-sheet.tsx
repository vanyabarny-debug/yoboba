'use client';

import { createElement, useState } from 'react';
import type { store_spot } from '@/lib/types';
import { admin_sheet } from '@/components/admin/admin-sheet';
import spot_rating from '@/components/spot-rating';
import { demo_cities } from '@/lib/location';
import { clean_spot_hours } from '@/lib/spot-store';
import { parse_yandex_org_id, yandex_review_url } from '@/lib/yandex-spot';

type props = {
  spot: store_spot | null;
  on_close: () => void;
  on_save: (spot: store_spot) => void;
  on_delete?: (id: string) => void;
};

export default function SpotEditSheet({ spot, on_close, on_save, on_delete }: props) {
  const [draft, set_draft] = useState<store_spot | null>(spot);

  const [draft_for, set_draft_for] = useState(spot);
  if (draft_for !== spot) {
    set_draft_for(spot);
    set_draft(spot);
  }

  if (!draft) return null;

  return createElement(
    admin_sheet,
    {
      open: true,
      title: draft.id && draft.address ? 'редактировать точку' : 'новая точка',
      on_close,
    },
    (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.city.trim() || !draft.address.trim()) return;
          on_save({
            ...draft,
            city: draft.city.trim().toLowerCase(),
            address: draft.address.trim(),
            label: draft.label?.trim() || undefined,
            yandex_org_id: parse_yandex_org_id(draft.yandex_org_id || ''),
            review_url: (draft.review_url || '').trim(),
            hours: clean_spot_hours(draft.hours) || undefined,
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
        <label className="block">
          <span className="text-sm text-neutral-600">виджет рейтинга Яндекса</span>
          <input
            value={draft.yandex_org_id ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              const pasted = /<|>|yandex|http/i.test(raw);
              const id = parse_yandex_org_id(raw);
              set_draft({
                ...draft,
                yandex_org_id: pasted ? id || raw : raw,
              });
            }}
            placeholder="номер организации или код виджета"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
          />
          <span className="mt-1 block text-xs text-neutral-400">
            вставьте код виджета, ссылку на карточку или номер. на сайте появятся рейтинг и QR на отзыв.
          </span>
        </label>
        <label className="block">
          <span className="text-sm text-neutral-600">ссылка на отзыв</span>
          <input
            value={draft.review_url ?? ''}
            onChange={(e) => set_draft({ ...draft, review_url: e.target.value })}
            placeholder="если пусто — отзывы этой организации в Яндекс Картах"
            className="mt-1 w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
          />
          {!draft.review_url?.trim() && yandex_review_url(draft) ? (
            <span className="mt-1 block text-xs text-neutral-400 break-all">
              QR откроет {yandex_review_url(draft)}
            </span>
          ) : null}
        </label>
        {createElement(spot_rating, { spot: draft })}
        <div className="block">
          <span className="text-sm text-neutral-600">режим работы</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="time"
              value={draft.hours?.open ?? ''}
              onChange={(e) =>
                set_draft({ ...draft, hours: { open: e.target.value, close: draft.hours?.close || '' } })
              }
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
            />
            <span className="text-neutral-400">—</span>
            <input
              type="time"
              value={draft.hours?.close ?? ''}
              onChange={(e) =>
                set_draft({ ...draft, hours: { open: draft.hours?.open || '', close: e.target.value } })
              }
              className="w-full rounded-xl border border-neutral-200 px-4 py-3 bg-cream/50"
            />
          </div>
          <span className="mt-1 block text-xs text-neutral-400">
            по москве. в эти часы пауза на кассе время от времени пищит, чтобы музыку включили.
          </span>
        </div>
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
    )
  );
}
